import { describe, expect, it } from 'vitest'
import { SseFramer } from './framer.ts'

describe('SseFramer', () => {
  it('frames a complete event', () => {
    const framer = new SseFramer()

    expect(framer.push('event: uploadFinished\ndata: {"ok":true}\n\n')).toEqual([
      { event: 'uploadFinished', data: '{"ok":true}' },
    ])
  })

  it('defaults a nameless frame to no event name, letting the core apply "message"', () => {
    const framer = new SseFramer()

    expect(framer.push('data: 1\n\n')).toEqual([{ data: '1' }])
  })

  it('buffers a frame split across chunks', () => {
    const framer = new SseFramer()

    expect(framer.push('event: tick\nda')).toEqual([])
    expect(framer.push('ta: {"n":1}\n')).toEqual([])
    expect(framer.push('\n')).toEqual([{ event: 'tick', data: '{"n":1}' }])
  })

  it('frames several events in one chunk', () => {
    const framer = new SseFramer()

    expect(framer.push('data: 1\n\ndata: 2\n\n')).toEqual([{ data: '1' }, { data: '2' }])
  })

  describe('line terminators', () => {
    it('accepts LF, CR and CRLF', () => {
      expect(new SseFramer().push('data: lf\n\n')).toEqual([{ data: 'lf' }])
      expect(new SseFramer().push('data: crlf\r\n\r\n')).toEqual([{ data: 'crlf' }])

      // A CR-terminated frame dispatches one byte late: until something
      // follows the final CR there is no telling it from the first half of a
      // CRLF, and guessing would split one terminator into two.
      const crFramer = new SseFramer()
      expect(crFramer.push('data: cr\r\r')).toEqual([])
      expect(crFramer.push('data: next\r\r')).toEqual([{ data: 'cr' }])
    })

    it('holds back a trailing CR so a CRLF split across chunks is one terminator', () => {
      const framer = new SseFramer()

      // Were the CR treated as a terminator now, the following LF would look
      // like the blank line that ends the frame and the payload would be lost.
      expect(framer.push('data: split\r')).toEqual([])
      expect(framer.push('\ndata: more\r\n\r\n')).toEqual([{ data: 'split\nmore' }])
    })

    it('treats a lone CR at the end of the stream as pending, not as a terminator', () => {
      const framer = new SseFramer()

      expect(framer.push('data: a\n\r')).toEqual([])
      expect(framer.push('\n')).toEqual([{ data: 'a' }])
    })
  })

  describe('field parsing', () => {
    it('strips exactly one leading space after the colon', () => {
      expect(new SseFramer().push('data:  padded\n\n')).toEqual([{ data: ' padded' }])
      expect(new SseFramer().push('data:tight\n\n')).toEqual([{ data: 'tight' }])
    })

    it('reads a line with no colon as a field with an empty value', () => {
      const framer = new SseFramer()

      expect(framer.push('data\n\n')).toEqual([{ data: '' }])
    })

    it('ignores comment frames', () => {
      const framer = new SseFramer()

      expect(framer.push(': heartbeat\n\n')).toEqual([])
      expect(framer.push('data: after\n\n')).toEqual([{ data: 'after' }])
    })

    it('ignores unknown field names', () => {
      const framer = new SseFramer()

      expect(framer.push('unknown: whatever\ndata: kept\n\n')).toEqual([{ data: 'kept' }])
    })

    it('joins several data lines with newlines', () => {
      const framer = new SseFramer()

      expect(framer.push('data: one\ndata: two\ndata:\n\n')).toEqual([{ data: 'one\ntwo\n' }])
    })
  })

  describe('ids', () => {
    it('reports the frame id and carries the cursor onto later frames', () => {
      const framer = new SseFramer()

      expect(framer.push('id: 7\ndata: a\n\n')).toEqual([{ id: '7', data: 'a', lastEventId: '7' }])
      // The cursor is sticky; the frame's own id is not, which is what keeps
      // the core's version gate from reading an id-less frame as a duplicate.
      expect(framer.push('data: b\n\n')).toEqual([{ data: 'b', lastEventId: '7' }])
      expect(framer.lastEventId).toBe('7')
    })

    it('moves the cursor on a data-less id frame without dispatching an event', () => {
      const framer = new SseFramer()

      expect(framer.push('id: 12\n\n')).toEqual([])
      expect(framer.lastEventId).toBe('12')
      expect(framer.push('data: next\n\n')).toEqual([{ data: 'next', lastEventId: '12' }])
    })

    it('clears the cursor on an empty id', () => {
      const framer = new SseFramer()

      framer.push('id: 4\ndata: a\n\n')
      expect(framer.push('id:\ndata: b\n\n')).toEqual([{ id: '', data: 'b', lastEventId: '' }])
      expect(framer.lastEventId).toBe('')
    })

    it('holds the cursor at an id whose frame the stream cut short', () => {
      const framer = new SseFramer()

      framer.push('id: 7\ndata: a\n\n')
      // The connection died before the terminator, so the event this `id:`
      // belongs to was never delivered — resuming past it would skip it.
      expect(framer.push('id: 8\ndata: b')).toEqual([])
      expect(framer.lastEventId).toBe('7')
    })

    it('ignores an id containing NUL rather than truncating it', () => {
      const framer = new SseFramer()

      framer.push('id: 9\ndata: a\n\n')
      expect(framer.push('id: 1\u000023\ndata: b\n\n')).toEqual([{ data: 'b', lastEventId: '9' }])
      expect(framer.lastEventId).toBe('9')
    })
  })

  describe('event names', () => {
    it('reads an empty event name as no name, leaving the core its "message" default', () => {
      const framer = new SseFramer()

      // The spec only overrides the `message` type when the event-type buffer
      // is non-empty, so `event:` with no value is not a name of its own.
      expect(framer.push('event:\ndata: 1\n\n')).toEqual([{ data: '1' }])
    })
  })

  describe('retry', () => {
    it('reads a digits-only retry hint', () => {
      const framer = new SseFramer()

      expect(framer.push('retry: 2500\ndata: a\n\n')).toEqual([{ data: 'a', retry: 2500 }])
    })

    it('ignores a non-numeric retry hint', () => {
      const framer = new SseFramer()

      expect(framer.push('retry: 2.5s\ndata: a\n\n')).toEqual([{ data: 'a' }])
    })

    it('stamps a retry-only frame onto the next dispatched frame', () => {
      const framer = new SseFramer()

      expect(framer.push('retry: 1000\n\n')).toEqual([])
      expect(framer.push('data: a\n\n')).toEqual([{ data: 'a', retry: 1000 }])
      // Connection-scoped, but reported once: the core clamps and remembers it.
      expect(framer.push('data: b\n\n')).toEqual([{ data: 'b' }])
    })
  })

  describe('carrying stream state across a reconnect', () => {
    it('reports the cursor the connection resumed from on an id-less frame', () => {
      const framer = new SseFramer({ lastEventId: 'e-7' })

      expect(framer.push('data: 1\n\n')).toEqual([{ data: '1', lastEventId: 'e-7' }])
    })

    it('stamps an inherited retry hint onto the first frame that dispatches', () => {
      const framer = new SseFramer({ retry: 4000 })

      expect(framer.push('data: 1\n\n')).toEqual([{ data: '1', retry: 4000 }])
      // Connection-scoped, not per-frame: it is spent once it has been reported.
      expect(framer.push('data: 2\n\n')).toEqual([{ data: '2' }])
      expect(framer.pendingRetry).toBeUndefined()
    })

    it('holds a retry hint no frame ever carried, so the caller can inherit it', () => {
      const framer = new SseFramer()

      expect(framer.push('retry: 9000\n\n')).toEqual([])
      expect(framer.pendingRetry).toBe(9000)
    })

    it('holds the cursor a data-less id frame left it at', () => {
      const framer = new SseFramer({ lastEventId: 'e-1' })

      expect(framer.push('data: 1\n\nid: e-2\n\n')).toEqual([{ data: '1', lastEventId: 'e-1' }])
      expect(framer.lastEventId).toBe('e-2')
    })
  })

  it('discards an unterminated trailing frame, as the spec requires', () => {
    const framer = new SseFramer()

    expect(framer.push('data: never dispatched\n')).toEqual([])
    expect(framer.lastEventId).toBeUndefined()
  })
})
