export type SseEvent = {
  event: string
  data: string
}

type SseParserState = {
  currentEvent: string
  currentData: string
}

function processLine(line: string, state: SseParserState): SseEvent | undefined {
  if (line.startsWith('event:')) {
    state.currentEvent = line.slice(6).trim()
    return undefined
  }

  if (line.startsWith('data:')) {
    if (state.currentData) {
      state.currentData += '\n'
    }
    state.currentData += line.slice(5).trim()
    return undefined
  }

  if (line === '' && state.currentData) {
    const event: SseEvent = { event: state.currentEvent, data: state.currentData }
    state.currentEvent = 'message'
    state.currentData = ''
    return event
  }

  return undefined
}

export async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  const state: SseParserState = { currentEvent: 'message', currentData: '' }

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last element — it may be a partial line
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const event = processLine(line, state)
        if (event) {
          yield event
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
