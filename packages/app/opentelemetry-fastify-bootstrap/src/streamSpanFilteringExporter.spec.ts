import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STREAM_ENDPOINT_SPAN_ATTRIBUTE,
  StreamSpanFilteringExporter,
} from './streamSpanFilteringExporter.ts'

// The export result type, derived from the SpanExporter
type ExportResult = Parameters<Parameters<SpanExporter['export']>[1]>[0]

/** Captures the spans handed to the wrapped exporter so tests can inspect the
 *  export payload (which is what Datadog receives), separate from the source. */
class CapturingExporter implements SpanExporter {
  received: ReadableSpan[] = []
  exportCalls = 0
  shutdownCalls = 0
  forceFlushCalls = 0
  lastResult: ExportResult | undefined

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.exportCalls++
    this.received.push(...spans)
    const result: ExportResult = { code: 0 }
    this.lastResult = result
    resultCallback(result)
  }

  shutdown(): Promise<void> {
    this.shutdownCalls++
    return Promise.resolve()
  }

  forceFlush(): Promise<void> {
    this.forceFlushCalls++
    return Promise.resolve()
  }
}

const makeSpan = (attributes: Record<string, unknown>, name = 'span'): ReadableSpan =>
  // Minimal ReadableSpan stand-in. `attributes` is the surface the exporter
  // reads; `name` lets us assert which spans made it through to the delegate.
  ({
    name,
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    attributes,
  }) as unknown as ReadableSpan

const streamSpan = () => makeSpan({ [STREAM_ENDPOINT_SPAN_ATTRIBUTE]: true }, 'stream')
const normalSpan = (name = 'normal') => makeSpan({ 'http.method': 'GET' }, name)

describe('StreamSpanFilteringExporter', () => {
  let delegate: CapturingExporter

  beforeEach(() => {
    delegate = new CapturingExporter()
  })

  describe('filtering', () => {
    it('drops spans carrying the stream-endpoint marker', () => {
      const exporter = new StreamSpanFilteringExporter(delegate)

      exporter.export([streamSpan()], () => {})

      expect(delegate.received).toHaveLength(0)
    })

    it('passes through spans without the marker, by identity', () => {
      const exporter = new StreamSpanFilteringExporter(delegate)
      const span = normalSpan()

      exporter.export([span], () => {})

      expect(delegate.received).toHaveLength(1)
      expect(delegate.received[0]).toBe(span)
    })

    it('keeps only the non-marked spans from a mixed batch', () => {
      const exporter = new StreamSpanFilteringExporter(delegate)
      const keep = normalSpan('keep')

      exporter.export([streamSpan(), keep, streamSpan()], () => {})

      expect(delegate.received).toHaveLength(1)
      expect(delegate.received[0]?.name).toBe('keep')
    })

    it('treats a non-true marker value as not a stream span', () => {
      const exporter = new StreamSpanFilteringExporter(delegate)
      // Only the boolean `true` marks a stream span; anything else passes through.
      const span = makeSpan({ [STREAM_ENDPOINT_SPAN_ATTRIBUTE]: 'true' }, 'stringy')

      exporter.export([span], () => {})

      expect(delegate.received).toHaveLength(1)
      expect(delegate.received[0]).toBe(span)
    })
  })

  describe('empty-batch short-circuit', () => {
    it('reports success and skips the delegate when every span is dropped', () => {
      const exporter = new StreamSpanFilteringExporter(delegate)
      const cb = vi.fn()

      exporter.export([streamSpan(), streamSpan()], cb)

      expect(delegate.exportCalls).toBe(0)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith({ code: 0 })
    })
  })

  describe('delegation', () => {
    it('forwards the resultCallback from the wrapped exporter when spans remain', () => {
      const exporter = new StreamSpanFilteringExporter(delegate)
      const cb = vi.fn()

      exporter.export([normalSpan()], cb)

      expect(delegate.exportCalls).toBe(1)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(delegate.lastResult)
    })

    it('delegates shutdown() to the wrapped exporter', async () => {
      const exporter = new StreamSpanFilteringExporter(delegate)

      await exporter.shutdown()

      expect(delegate.shutdownCalls).toBe(1)
    })

    it('delegates forceFlush() to the wrapped exporter', async () => {
      const exporter = new StreamSpanFilteringExporter(delegate)

      await exporter.forceFlush()

      expect(delegate.forceFlushCalls).toBe(1)
    })

    it('resolves forceFlush() even when the wrapped exporter has none', async () => {
      const minimal: SpanExporter = {
        export: (_spans, cb) => cb({ code: 0 }),
        shutdown: () => Promise.resolve(),
      }
      const exporter = new StreamSpanFilteringExporter(minimal)

      await expect(exporter.forceFlush()).resolves.toBeUndefined()
    })
  })
})
