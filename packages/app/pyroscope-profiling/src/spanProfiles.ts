import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { isSpanProfilingEnabledInEnv } from './profilingConfig.ts'
import type { ProfilingLogger } from './types.ts'
import { closeLabelScope, openLabelScope } from './wallLabels.ts'

/**
 * Ties a wall profile to the trace taken during it, by labelling the profiler's
 * samples with the span they were taken under.
 *
 * A wall profile of async Node code does not roll up. Every `await` resumes in
 * a microtask whose stack root is the scheduler rather than the caller, so a
 * function that drove most of a run can show a cumulative share close to zero
 * in a flame graph, and only its flat self time means anything. Attributing
 * that self time to a request or a job then means recognising file names.
 *
 * Labels are the way out: Pyroscope can filter a flame graph by any label a
 * sample carries. This sets `span_id` and `span_name` for the duration of a
 * local root span, and writes the same id onto the span as
 * `pyroscope.profile.id`, which is what a Grafana trace view follows to the
 * profile.
 *
 * ```bash
 * pyroscope-analyze --service my-service --select 'span_name="POST /v1/content/refresh"'
 * ```
 *
 * Three things to know before reading one.
 *
 * `span_name` is the name the span carries when it starts. For a job, a
 * consumer or anything named by the code that opened it, that is its final
 * name. For an HTTP request it is the bare method: OpenTelemetry's HTTP
 * instrumentation only renames its server span to `POST /v1/content/refresh`
 * once the response has gone out, which is after every sample of that request
 * has been taken. `pyroscopeProfilingPlugin`
 * (`@lokalise/pyroscope-profiling/fastify`) labels the route from an
 * `onRequest` hook, where it is known, and registering it is what makes the
 * query above return anything.
 *
 * The profiler holds one label set for the whole process rather than one per
 * async context, so labels are only as accurate as the concurrency allows: the
 * samples taken while two root spans are open carry the labels of whichever
 * started last, and work a span starts without awaiting is labelled by whatever
 * is current when it resumes. A local run driving one journey at a time gets
 * clean per-journey flame graphs; a busy shared environment gets an
 * approximation.
 *
 * And only local root spans are labelled: a span with no parent, or one whose
 * parent is remote, which is what an incoming traced request looks like. A
 * child span shares the process-wide label set with its parent, so labelling
 * both would mean the inner one deciding what the outer one's samples say, and
 * the outer one is the request or the job, which is the unit worth filtering
 * by.
 */
export class PyroscopeSpanProcessor implements SpanProcessor {
  /**
   * Spans whose labels are still to be restored. Bounded, because a span that
   * never ends (a dropped export, a process going down mid-request) would
   * otherwise hold its entry forever.
   */
  private static readonly MAX_TRACKED_SPANS = 1024

  private readonly scopeBySpanId = new Map<string, number>()
  private readonly logger?: ProfilingLogger
  private labelFailureReported = false

  constructor(logger?: ProfilingLogger) {
    this.logger = logger
  }

  onStart(span: Span): void {
    if (!isLocalRootSpan(span)) return
    const { spanId } = span.spanContext()
    try {
      const scope = openLabelScope({ span_id: spanId, span_name: span.name })
      // Started before the profiler, or started with profiling off: the span is
      // left exactly as it was.
      if (scope === undefined) return

      if (this.scopeBySpanId.size >= PyroscopeSpanProcessor.MAX_TRACKED_SPANS) {
        const oldest = this.scopeBySpanId.keys().next().value
        if (oldest !== undefined) this.release(oldest)
      }
      this.scopeBySpanId.set(spanId, scope)
      span.setAttribute('pyroscope.profile.id', spanId)
    } catch (error) {
      // A profiler that cannot be labelled is not a reason to lose a span.
      this.report(error, '[PYROSCOPE] Failed to label a span profile')
    }
  }

  onEnd(span: ReadableSpan): void {
    try {
      this.release(span.spanContext().spanId)
    } catch (error) {
      this.report(error, '[PYROSCOPE] Failed to restore wall labels after a span')
    }
  }

  /**
   * Nothing is buffered here: the profiler ships its own windows, and
   * `stopProfiling` flushes the last one.
   */
  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    for (const spanId of [...this.scopeBySpanId.keys()]) {
      try {
        this.release(spanId)
      } catch (error) {
        this.report(error, '[PYROSCOPE] Failed to restore wall labels after a span')
      }
    }
    return Promise.resolve()
  }

  private release(spanId: string): void {
    const scope = this.scopeBySpanId.get(spanId)
    if (scope === undefined) return
    this.scopeBySpanId.delete(spanId)
    closeLabelScope(scope)
  }

  /**
   * Whatever makes labelling fail usually keeps failing, and at request rates
   * one warn per span buries the output it was meant to explain. The first
   * failure is the diagnostic; the rest are only there for someone already
   * reading at debug level.
   */
  private report(error: unknown, message: string): void {
    if (this.labelFailureReported) {
      this.logger?.debug({ err: error }, message)
      return
    }
    this.labelFailureReported = true
    this.logger?.warn({ err: error }, message)
  }
}

/**
 * The span processors to hand `initOpenTelemetry`, which is one of them when
 * span profiles were asked for and none otherwise.
 *
 * Needs both `PYROSCOPE_ENABLED` and `PYROSCOPE_SPAN_PROFILES_ENABLED`, because
 * a label needs a profiler to land on. With either off this returns an empty
 * array and tracing behaves exactly as it did before.
 *
 * @example
 * ```ts
 * initOpenTelemetry({ spanProcessors: buildPyroscopeSpanProcessors() })
 * ```
 */
export function buildPyroscopeSpanProcessors(logger?: ProfilingLogger): SpanProcessor[] {
  return isSpanProfilingEnabledInEnv() ? [new PyroscopeSpanProcessor(logger)] : []
}

/**
 * A span with no parent, or one whose parent is in another process: an incoming
 * request carrying a `traceparent` is a child of the caller's span and still
 * the outermost span here, which is the one worth labelling. Treating it as a
 * child instead would leave every service behind a traced caller with no span
 * labels at all.
 *
 * OTel 2.x carries the parent as a span context. 1.x carried the id alone and
 * said nothing about where it came from, so under it a traced incoming request
 * reads as a child; the peer dependency asks for 2.x.
 */
function isLocalRootSpan(span: Span): boolean {
  const withParent = span as Span & {
    parentSpanContext?: { spanId?: string; isRemote?: boolean }
    parentSpanId?: string
  }
  const parent = withParent.parentSpanContext
  if (parent?.spanId) return parent.isRemote === true
  return !withParent.parentSpanId
}
