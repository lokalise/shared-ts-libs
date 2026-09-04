import type { FallbackParsedSseFrame } from './types.ts'

const NULL_CHARACTER = '\u0000'
const DIGITS_ONLY = /^\d+$/

/**
 * What a framer starts a connection with.
 *
 * The Last-Event-ID cursor is stream-scoped rather than connection-scoped, so
 * a reconnect starts where the previous connection left the core rather than
 * from nothing — which is what lets an id-less frame report the cursor it
 * inherited instead of none at all.
 */
export type SseFramerOptions = {
  /** Last-Event-ID the connection resumed from. */
  lastEventId?: string
}

/**
 * Incremental Server-Sent Events framer.
 *
 * Exists because the two things this package needs from a stream are not
 * available from a framer that models the browser's `EventSource`:
 *
 * - the **per-frame `id:`**, kept apart from the sticky Last-Event-ID cursor.
 *   The fallback core's default version extractor reads the frame's own id, so
 *   a framer that only reports the cursor would make every id-less frame look
 *   like a repeat of the previous version and the version gate would drop it.
 * - **frame-level inspection without consuming the stream**, so raw chunks can
 *   be passed through to the core untouched while their payloads are validated
 *   against the contract on the side.
 *
 * Framing follows the WHATWG event-stream rules: CR, LF and CRLF all end a
 * line (a trailing CR is held back across chunk boundaries so CRLF is never
 * split into two terminators), exactly one leading space is stripped after the
 * colon, a line with no colon is a field with an empty value, a line starting
 * with a colon is a comment, `retry:` takes ASCII digits only, an `id:`
 * containing NUL is ignored, an empty `event:` leaves the event type at
 * `message`, and the reconnect cursor moves only when a frame is dispatched.
 */
export class SseFramer {
  /** Unterminated tail of the last chunk, including a held-back trailing CR. */
  private buffer = ''
  private dataLines: string[] = []
  private eventName: string | undefined
  private frameId: string | undefined
  /**
   * `retry:` is connection-scoped rather than per-frame, and a frame carrying
   * only `retry:` dispatches nothing — so the hint is held and stamped onto the
   * next frame that does dispatch.
   */
  private retryHint: number | undefined
  /**
   * The spec's *last event ID buffer*: whatever the most recent `id:` line
   * carried. Unlike the data and event-type buffers it is never reset between
   * frames, which is what makes the cursor sticky.
   */
  private idBuffer: string | undefined
  /**
   * The spec's *last event ID string* — the buffer's value as of the last
   * dispatch, which is the only place it moves.
   *
   * An `id:` in a frame the connection cut short before its terminator must
   * not advance it: the event that frame was carrying was never delivered, and
   * resuming a reconnect past it would skip it for good.
   */
  private cursor: string | undefined

  constructor(options: SseFramerOptions = {}) {
    this.cursor = options.lastEventId
    this.idBuffer = options.lastEventId
  }

  /** The Last-Event-ID cursor as of the last processed frame. */
  get lastEventId(): string | undefined {
    return this.cursor
  }

  /**
   * Feed decoded text and collect whatever frames it completed.
   *
   * A frame that carried no `data:` field dispatches nothing (an `id:`-only or
   * `retry:`-only frame updates the cursor / retry hint instead), and neither
   * do comment frames, matching what a consumer of parsed events can observe.
   */
  push(chunk: string): FallbackParsedSseFrame[] {
    const frames: FallbackParsedSseFrame[] = []
    this.buffer += chunk

    let lineStart = 0
    let index = 0
    while (index < this.buffer.length) {
      const character = this.buffer[index]
      if (character !== '\n' && character !== '\r') {
        index += 1
        continue
      }
      // A CR at the very end of the buffer may be the first half of a CRLF
      // that lands in the next chunk; leave it for then.
      if (character === '\r' && index === this.buffer.length - 1) break

      const line = this.buffer.slice(lineStart, index)
      index += character === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1
      lineStart = index

      const frame = this.handleLine(line)
      if (frame) frames.push(frame)
    }

    this.buffer = this.buffer.slice(lineStart)
    return frames
  }

  private handleLine(line: string): FallbackParsedSseFrame | undefined {
    if (line === '') return this.dispatch()
    // A comment frame (`: heartbeat`) carries no fields.
    if (line.startsWith(':')) return undefined

    const colonIndex = line.indexOf(':')
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
    const rawValue = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

    if (field === 'event') {
      this.eventName = value
    } else if (field === 'data') {
      this.dataLines.push(value)
    } else if (field === 'id') {
      // Per spec an id containing NUL is ignored outright, rather than
      // truncated — a truncated cursor would replay from the wrong point.
      if (!value.includes(NULL_CHARACTER)) {
        this.frameId = value
        this.idBuffer = value
      }
    } else if (field === 'retry' && DIGITS_ONLY.test(value)) {
      this.retryHint = Number(value)
    }
    // Any other field name is ignored, as the spec requires.
    return undefined
  }

  private dispatch(): FallbackParsedSseFrame | undefined {
    // The spec's first dispatch step, and it runs even for a frame that goes
    // on to dispatch nothing: an `id:`-only frame still moves the cursor.
    this.cursor = this.idBuffer
    const eventName = this.eventName
    const frameId = this.frameId
    const dataLines = this.dataLines
    this.eventName = undefined
    this.frameId = undefined
    this.dataLines = []

    if (dataLines.length === 0) return undefined

    const retry = this.retryHint
    this.retryHint = undefined

    return {
      data: dataLines.join('\n'),
      // An empty `event:` leaves the event-type buffer empty, which the spec
      // reads as `message`. Reporting `''` as a name of its own would send the
      // frame looking for a schema by that name and count it as undeclared.
      ...(eventName !== undefined && eventName !== '' && { event: eventName }),
      ...(frameId !== undefined && { id: frameId }),
      ...(retry !== undefined && { retry }),
      ...(this.cursor !== undefined && { lastEventId: this.cursor }),
    }
  }
}
