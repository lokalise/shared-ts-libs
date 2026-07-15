import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbNamespaceSpanExporter } from './dbNamespaceSpanExporter.ts'

// The export result type, derived from the SpanExporter contract so this file
// needs no dependency on @opentelemetry/core.
type ExportResult = Parameters<Parameters<SpanExporter['export']>[1]>[0]

function makeSpan(
  attributes: Record<string, unknown>,
  extra: Partial<ReadableSpan> = {},
): ReadableSpan {
  // Minimal ReadableSpan stand-in. `attributes` is the surface the exporter
  // reads/derives from; `name` + `spanContext` let us assert the Proxy view
  // delegates non-attribute reads to the original span.
  return {
    name: 'span',
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    ...extra,
    attributes,
  } as unknown as ReadableSpan
}

/** Captures the spans handed to the wrapped exporter so tests can inspect the
 *  export payload (which is what Datadog receives), separate from the source. */
class CapturingExporter implements SpanExporter {
  received: ReadableSpan[] = []
  shutdownCalls = 0
  forceFlushCalls = 0
  lastResult: ExportResult | undefined

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
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

function exportOne(exporter: DbNamespaceSpanExporter, span: ReadableSpan): void {
  exporter.export([span], () => {})
}

describe('DbNamespaceSpanExporter', () => {
  let delegate: CapturingExporter
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    delegate = new CapturingExporter()
    // Re-install no-op impls every test because vitest config `mockReset: true`
    // would otherwise revert spies to pass-through, polluting the runner output.
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('construction', () => {
    it('throws when a mapping value is an empty string', () => {
      // Empty values silently no-op every span in production; surfacing the
      // misconfiguration at startup keeps the operator from chasing a missing
      // Datadog edge later.
      expect(
        () => new DbNamespaceSpanExporter(delegate, { dbNamespaceBySystem: { elasticsearch: '' } }),
      ).toThrow(/non-empty/)
    })

    it('throws when a mapping value is not a string', () => {
      expect(
        () =>
          new DbNamespaceSpanExporter(delegate, {
            dbNamespaceBySystem: { elasticsearch: 42 as unknown as string },
          }),
      ).toThrow(/non-empty/)
    })

    it('throws when a mapping key is an empty string', () => {
      expect(
        () => new DbNamespaceSpanExporter(delegate, { dbNamespaceBySystem: { '': 'lokalise' } }),
      ).toThrow(/non-empty/)
    })

    it('accepts an empty mapping object (no-op exporter)', () => {
      expect(() => new DbNamespaceSpanExporter(delegate, { dbNamespaceBySystem: {} })).not.toThrow()
    })

    it('is unaffected by mutation of the options object after construction', () => {
      const dbNamespaceBySystem: Record<string, string> = { elasticsearch: 'lokalise' }
      const exporter = new DbNamespaceSpanExporter(delegate, { dbNamespaceBySystem })

      dbNamespaceBySystem.elasticsearch = ''
      dbNamespaceBySystem.redis = 'cache'

      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch' }))
      exportOne(exporter, makeSpan({ 'db.system': 'redis' }))

      expect(delegate.received[0]?.attributes['db.namespace']).toBe('lokalise')
      expect(delegate.received[1]?.attributes['db.namespace']).toBeUndefined()
    })
  })

  describe('export payload shaping', () => {
    it('adds db.namespace to the export payload when db.system matches', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch' }))

      expect(delegate.received[0]?.attributes['db.namespace']).toBe('lokalise')
    })

    it('does NOT mutate the source span — only the export view carries db.namespace', () => {
      // The whole point of using an exporter: the shared span every other
      // processor/exporter sees must stay untouched. We only shape our payload.
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })
      const sourceAttrs = { 'db.system': 'elasticsearch' }
      const source = makeSpan(sourceAttrs)

      exportOne(exporter, source)

      expect(source.attributes['db.namespace']).toBeUndefined()
      expect(sourceAttrs).not.toHaveProperty('db.namespace')
      expect(delegate.received[0]).not.toBe(source)
      expect(delegate.received[0]?.attributes['db.namespace']).toBe('lokalise')
    })

    it('delegates non-attribute reads on the export view to the source span', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })
      const source = makeSpan({ 'db.system': 'elasticsearch' }, { name: 'elasticsearch.search' })

      exportOne(exporter, source)
      const view = delegate.received[0]

      expect(view?.name).toBe('elasticsearch.search')
      // Method reads must still work (bound to the original span).
      expect(view?.spanContext().traceId).toBe('a'.repeat(32))
    })

    it('writes no peer.* tag — Datadog derives those from the short-form attributes', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch' }))
      const view = delegate.received[0]

      expect(view?.attributes['peer.db.system']).toBeUndefined()
      expect(view?.attributes['peer.db.name']).toBeUndefined()
    })

    it('passes through when db.system is an empty string', () => {
      // The length-0 guard bails on the empty string so we never map '' to a
      // namespace. We match only on the OTel `db.system` — no peer.* fallback,
      // since nothing upstream of the exporter produces peer.* (Datadog derives
      // those at ingestion).
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': '' }))

      expect(delegate.received[0]?.attributes['db.namespace']).toBeUndefined()
    })
  })

  describe('non-overwrite guarantees', () => {
    it('does not replace an existing non-empty db.namespace', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })
      const source = makeSpan({ 'db.system': 'elasticsearch', 'db.namespace': 'preserve-me' })

      exportOne(exporter, source)

      expect(delegate.received[0]?.attributes['db.namespace']).toBe('preserve-me')
      // An untouched span is passed through by identity (no Proxy allocated).
      expect(delegate.received[0]).toBe(source)
    })

    it('replaces an empty-string db.namespace (treated as absent, not preserved)', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch', 'db.namespace': '' }))

      expect(delegate.received[0]?.attributes['db.namespace']).toBe('lokalise')
    })
  })

  describe('no-op cases (span passed through unchanged)', () => {
    it('passes through when db.system has no mapping entry', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })
      const source = makeSpan({ 'db.system': 'redis' })

      exportOne(exporter, source)

      expect(delegate.received[0]).toBe(source)
      expect(delegate.received[0]?.attributes['db.namespace']).toBeUndefined()
    })

    it('passes through when no db.system attribute is present', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })
      const source = makeSpan({ 'http.method': 'GET' })

      exportOne(exporter, source)

      expect(delegate.received[0]).toBe(source)
    })

    it('ignores non-string db.system values', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 42 }))

      expect(delegate.received[0]?.attributes['db.namespace']).toBeUndefined()
    })

    it('does not resolve db.system values through Object.prototype', () => {
      // A plain-record lookup would resolve 'constructor' to
      // Object.prototype.constructor and add a function as an attribute.
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 'constructor' }))

      expect(delegate.received[0]?.attributes['db.namespace']).toBeUndefined()
    })
  })

  describe('delegation', () => {
    it('forwards the resultCallback from the wrapped exporter', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })
      const cb = vi.fn()

      exporter.export([makeSpan({ 'db.system': 'elasticsearch' })], cb)

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(delegate.lastResult)
    })

    it('delegates shutdown() to the wrapped exporter', async () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      await exporter.shutdown()

      expect(delegate.shutdownCalls).toBe(1)
    })

    it('delegates forceFlush() to the wrapped exporter', async () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      await exporter.forceFlush()

      expect(delegate.forceFlushCalls).toBe(1)
    })

    it('resolves forceFlush() even when the wrapped exporter has none', async () => {
      const minimal: SpanExporter = {
        export: (_spans, cb) => cb({ code: 0 }),
        shutdown: () => Promise.resolve(),
      }
      const exporter = new DbNamespaceSpanExporter(minimal, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise' },
      })

      await expect(exporter.forceFlush()).resolves.toBeUndefined()
    })
  })

  describe('first-match logging', () => {
    it('logs once per db.system on the first matching export', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsearch: 'lokalise', redis: 'cache' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch' }))
      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch' }))
      exportOne(exporter, makeSpan({ 'db.system': 'redis' }))

      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
      const messages = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0]))
      expect(messages.some((m: string) => m.includes('"dbSystem":"elasticsearch"'))).toBe(true)
      expect(messages.some((m: string) => m.includes('"dbSystem":"redis"'))).toBe(true)
    })

    it('does not log when no spans match the mapping', () => {
      const exporter = new DbNamespaceSpanExporter(delegate, {
        dbNamespaceBySystem: { elasticsarch: 'lokalise' },
      })

      exportOne(exporter, makeSpan({ 'db.system': 'elasticsearch' }))

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })
})
