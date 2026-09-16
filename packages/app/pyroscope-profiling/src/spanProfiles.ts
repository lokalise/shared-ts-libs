import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { runningProfiler } from './profiler.ts'
import { isSpanProfilingEnabledInEnv } from './profilingConfig.ts'
import type { ProfilingLogger } from './types.ts'

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
 * sample carries, and the profiler takes them from the async context a sample
 * was captured in. This sets `span_id` and `span_name` for the duration of a
 * root span, and writes the same id onto the span as `pyroscope.profile.id`,
 * which is what a Grafana trace view follows to the profile.
 *
 * Two things to know before reading one.
 *
 * The labels live in the profiler's own async context, which is the OTel one
 * only as far as both are tracked by the same async resource chain. Work that a
 * span starts and does not await lands wherever it resumes, which can be after
 * the span has ended and the labels have been put back.
 *
 * And only root spans are labelled. A child span shares its parent's async
 * context, so labelling both would mean the inner one deciding what the outer
 * one's samples say, and the outer one is the request or the job, which is the
 * unit worth filtering by.
 */
export class PyroscopeSpanProcessor implements SpanProcessor {
  /**
   * Spans whose labels are still to be restored. Bounded, because a span that
   * never ends (a dropped export, a process going down mid-request) would
   * otherwise hold its entry forever.
   */
  private static readonly MAX_TRACKED_SPANS = 1024

  private readonly labelsBySpanId = new Map<string, WallLabels>()
  private readonly logger?: ProfilingLogger

  constructor(logger?: ProfilingLogger) {
    this.logger = logger
  }

  onStart(span: Span): void {
    const profiler = runningProfiler()
    // Started before the profiler, or started with profiling off: the span is
    // left exactly as it was.
    if (!profiler || !isRootSpan(span)) {
      return
    }
    const { spanId } = span.spanContext()
    try {
      const previous = profiler.default.getWallLabels()
      if (this.labelsBySpanId.size >= PyroscopeSpanProcessor.MAX_TRACKED_SPANS) {
        // Every entry is a span that never reached onEnd, so none of them is
        // going to be restored. Dropping them all keeps this bounded without
        // pretending one of them is more current than the others.
        this.labelsBySpanId.clear()
      }
      this.labelsBySpanId.set(spanId, previous)
      profiler.default.setWallLabels({ ...previous, span_id: spanId, span_name: span.name })
      span.setAttribute('pyroscope.profile.id', spanId)
    } catch (error) {
      // A profiler that cannot be labelled is not a reason to lose a span.
      this.logger?.warn({ error }, '[PYROSCOPE] Failed to label a span profile')
    }
  }

  onEnd(span: ReadableSpan): void {
    const { spanId } = span.spanContext()
    const previous = this.labelsBySpanId.get(spanId)
    if (!previous) {
      return
    }
    this.labelsBySpanId.delete(spanId)
    try {
      runningProfiler()?.default.setWallLabels(previous)
    } catch (error) {
      this.logger?.warn({ error }, '[PYROSCOPE] Failed to restore wall labels after a span')
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
    this.labelsBySpanId.clear()
    return Promise.resolve()
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

type WallLabels = Record<string, number | string>

/**
 * OTel 2.x carries the parent as a span context; 1.x carried the id alone.
 * Either way, no parent is what makes a span the one worth labelling.
 */
function isRootSpan(span: Span): boolean {
  const withParent = span as Span & {
    parentSpanContext?: { spanId?: string }
    parentSpanId?: string
  }
  return !(withParent.parentSpanContext?.spanId ?? withParent.parentSpanId)
}
