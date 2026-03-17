export type SseEvent = {
  event: string
  data: string
}

class SseParser {
  private currentEvent = 'message'
  private currentData = ''

  processLine(line: string): SseEvent | undefined {
    if (line.startsWith('event:')) {
      this.currentEvent = line.slice(6).trim()
      return undefined
    }

    if (line.startsWith('data:')) {
      if (this.currentData) {
        this.currentData += '\n'
      }
      this.currentData += line.slice(5).trim()
      return undefined
    }

    if (line === '' && this.currentData) {
      const event: SseEvent = { event: this.currentEvent, data: this.currentData }
      this.currentEvent = 'message'
      this.currentData = ''
      return event
    }

    return undefined
  }
}

export async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  const parser = new SseParser()

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last element — it may be a partial line (split always returns at least 1 element)
      /* v8 ignore start */
      buffer = lines.pop() ?? ''
      /* v8 ignore stop */

      for (const line of lines) {
        const event = parser.processLine(line)
        if (event) {
          yield event
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
