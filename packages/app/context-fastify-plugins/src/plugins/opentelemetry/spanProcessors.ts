import { requestContext } from '@fastify/request-context'
import type { Span } from '@opentelemetry/sdk-trace-base'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

import { REQUEST_ID_STORE_KEY } from '../requestContextProviderPlugin.ts'

/**
 * Extends span processor to be able to attach custom attributes request id to spans.
 *
 * This might be easier in the future once the opentelemetry instrumentation for prisma
 * has matured a bit more.
 *
 * @see https://github.com/prisma/prisma/issues/14640#issuecomment-1209931862
 */
export class LokaliseSimpleSpanProcessor extends SimpleSpanProcessor {
  override onStart(span: Span) {
    const requestId = requestContext.get(REQUEST_ID_STORE_KEY)
    span.setAttribute(REQUEST_ID_STORE_KEY, requestId)
  }
}

export class LokaliseBatchSpanProcessor extends BatchSpanProcessor {
  override onStart(span: Span) {
    const requestId = requestContext.get(REQUEST_ID_STORE_KEY)
    span.setAttribute(REQUEST_ID_STORE_KEY, requestId)
  }
}
