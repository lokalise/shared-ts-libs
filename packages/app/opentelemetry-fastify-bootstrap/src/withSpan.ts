import { type Attributes, type Span, SpanStatusCode, trace } from '@opentelemetry/api'

// A proxy until initOpenTelemetry() registers the SDK, so module-level use is safe
const tracer = trace.getTracer('@lokalise/opentelemetry-fastify-bootstrap')

type SpanFn<T> = (span: Span) => T | Promise<T>

/**
 * Runs `fn` inside a new active span. The span is a child of whatever span is
 * active, is marked as an error if `fn` throws, and always ends.
 */
export function withSpan<T>(name: string, fn: SpanFn<T>): Promise<T>
export function withSpan<T>(name: string, attributes: Attributes, fn: SpanFn<T>): Promise<T>
export function withSpan<T>(
  name: string,
  attributesOrFn: Attributes | SpanFn<T>,
  maybeFn?: SpanFn<T>,
): Promise<T> {
  const [attributes, fn] =
    typeof attributesOrFn === 'function'
      ? [{}, attributesOrFn]
      : [attributesOrFn, maybeFn as SpanFn<T>]

  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span)
    } catch (err) {
      span.recordException(err instanceof Error ? err : String(err))
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw err
    } finally {
      span.end()
    }
  })
}
