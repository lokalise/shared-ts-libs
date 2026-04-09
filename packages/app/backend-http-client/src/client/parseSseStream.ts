import { Readable } from 'node:stream'
import type { SseSchemaByEventName } from '@lokalise/api-contracts'
import { ServerSentEventTransformStream } from 'parse-sse'
import type { Dispatcher } from 'undici'

export async function* parseSseStream(
  body: Dispatcher.ResponseData['body'],
  schemaByEventName: SseSchemaByEventName,
): AsyncGenerator {
  const sseStream = Readable.toWeb(body)
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new ServerSentEventTransformStream())

  for await (const { type, data, lastEventId, retry } of sseStream) {
    const schema = schemaByEventName[type]

    if (!schema) {
      throw new Error(`Schema for event "${type}" not found.`)
    }

    yield { type, data: schema.parse(JSON.parse(data)), lastEventId, retry }
  }
}
