import type { CommonLogger } from '@lokalise/node-core'
import type { ConsumerBaseMessageType, Prehandler } from '@message-queue-toolkit/core'
import type { RequestContext } from '@lokalise/fastify-extras'

export type RequestContextPreHandlerOutput = { requestContext: RequestContext }

export const createRequestContextPreHandler =
  (
    logger: CommonLogger,
  ): Prehandler<ConsumerBaseMessageType, unknown, RequestContextPreHandlerOutput> =>
  (event, _context, outputs, next) => {
    outputs.requestContext = {
      reqId: event.metadata.correlationId,
      logger: logger.child({ 'x-request-id': event.metadata.correlationId }),
    }
    next({ result: 'success' })
  }
