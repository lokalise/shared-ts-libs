import { randomUUID } from 'node:crypto'
import type { RequestContext } from '@lokalise/fastify-extras'
import { globalLogger } from '@lokalise/node-core'

export const createRequestContext = (): RequestContext => {
  return {
    reqId: randomUUID(),
    logger: globalLogger,
  }
}
