// Convenience re-export: the event-schema shape used by SSE contract responses.
export type { SSEEventSchemas } from '@lokalise/api-contracts'
export type {
  ApiHandlerReply,
  ApiRouteOptions,
  InferApiHandler,
  InferApiHandlerRequest,
  InferApiHandlerResult,
} from './apiHandlerTypes.ts'
export { buildFastifyApiRoute, buildFastifyApiRouteHandler } from './buildFastifyApiRoute.ts'
export type {
  DualModeType,
  FastifySSERouteOptions,
  SSECloseReason,
  SSEContext,
  SSEEventSender,
  SSEMessage,
  SSESession,
  SSESessionMode,
  SSEStartOptions,
  SSEStreamMessage,
} from './sseTypes.ts'
export { determineMode, hasHttpStatusCode, isErrorLike, type SSEReply } from './sseUtils.ts'
