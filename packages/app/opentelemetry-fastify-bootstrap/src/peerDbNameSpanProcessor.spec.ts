import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PeerDbNameSpanProcessor } from './peerDbNameSpanProcessor.ts'

function makeSpan(attributes: Record<string, unknown>): ReadableSpan {
  // Minimal ReadableSpan stand-in. We only need the mutable `attributes` map
  // because that's the sole surface the processor touches.
  return { attributes } as unknown as ReadableSpan
}

describe('PeerDbNameSpanProcessor', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Re-install no-op impls every test because vitest config `restoreMocks: true`
    // would otherwise revert spies to pass-through, polluting the test runner output.
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
      expect(() => new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: '' } })).toThrow(
        /non-empty/,
      )
    })

    it('throws when a mapping value is not a string', () => {
      expect(
        () =>
          new PeerDbNameSpanProcessor({
            dbNames: { elasticsearch: 42 as unknown as string },
          }),
      ).toThrow(/non-empty/)
    })

    it('accepts an empty mapping object (no-op processor)', () => {
      // The wiring layer in initOpenTelemetry short-circuits empty mappings
      // before constructing a processor, but constructing one directly with
      // an empty map should not throw — it's a vacuous configuration, not
      // an invalid one.
      expect(() => new PeerDbNameSpanProcessor({ dbNames: {} })).not.toThrow()
    })
  })

  describe('stamping behavior', () => {
    it('stamps db.namespace from the dbNames mapping when db.system matches', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'db.system': 'elasticsearch' })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBe('lokalise')
    })

    it('mirrors db.system to peer.db.system when only db.system is present', () => {
      // @elastic/transport sets db.system but not peer.db.system, and DD's
      // entity key uses peer.db.*, so the processor must mirror.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'db.system': 'elasticsearch' })

      processor.onEnd(span)

      expect(span.attributes['peer.db.system']).toBe('elasticsearch')
    })

    it('reads peer.db.system as a fallback when db.system is absent', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'peer.db.system': 'elasticsearch' })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBe('lokalise')
    })
  })

  describe('non-overwrite guarantees', () => {
    it('does not overwrite an existing db.namespace', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({
        'db.system': 'elasticsearch',
        'db.namespace': 'preserve-me',
      })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBe('preserve-me')
    })

    it('does not overwrite an existing peer.db.system that differs from db.system', () => {
      // Defensive: if an instrumentation set a different peer.db.system,
      // preserve it. We're filling gaps, not relabeling.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({
        'db.system': 'elasticsearch',
        'peer.db.system': 'something-explicit',
      })

      processor.onEnd(span)

      expect(span.attributes['peer.db.system']).toBe('something-explicit')
    })
  })

  describe('no-op cases', () => {
    it('does nothing when db.system has no mapping entry', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'db.system': 'redis' })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBeUndefined()
    })

    it('does nothing when no db.system attribute is present', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'http.method': 'GET' })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBeUndefined()
    })

    it('ignores non-string db.system values', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'db.system': 42 })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBeUndefined()
    })
  })

  describe('first-match logging', () => {
    it('logs once per db.system on the first successful stamp', () => {
      // Operators need confirmation the processor is actually firing in
      // production. Logging on every span is too noisy; logging once per
      // matched system gives a single startup signal per cluster.
      const processor = new PeerDbNameSpanProcessor({
        dbNames: { elasticsearch: 'lokalise', redis: 'cache' },
      })

      processor.onEnd(makeSpan({ 'db.system': 'elasticsearch' }))
      processor.onEnd(makeSpan({ 'db.system': 'elasticsearch' }))
      processor.onEnd(makeSpan({ 'db.system': 'redis' }))

      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
      const messages = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0]))
      expect(messages.some((m: string) => m.includes('"dbSystem":"elasticsearch"'))).toBe(true)
      expect(messages.some((m: string) => m.includes('"dbSystem":"redis"'))).toBe(true)
    })

    it('does not log when no spans match the mapping', () => {
      // A misconfigured mapping (typo in db.system key) should not produce
      // a "stamped" log — keeps the success signal honest.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsarch: 'lokalise' } })
      processor.onEnd(makeSpan({ 'db.system': 'elasticsearch' }))

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('frozen attributes (future SDK upgrade guard)', () => {
    it('does not throw when span.attributes is frozen', () => {
      // Future @opentelemetry/sdk-trace-base versions may freeze attributes on
      // span end (the ReadableSpan type already marks them Readonly). The
      // processor must not blow up the SDK pipeline; it should log once and
      // disarm.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const frozen = Object.freeze({ 'db.system': 'elasticsearch' })
      const span = makeSpan(frozen)

      expect(() => processor.onEnd(span)).not.toThrow()
    })

    it('logs the mutability failure exactly once and disarms further stamping', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const frozen = Object.freeze({ 'db.system': 'elasticsearch' })

      processor.onEnd(makeSpan(frozen))
      processor.onEnd(makeSpan(frozen))

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain('not mutable')

      // A subsequent mutable span receives no stamp either — the processor
      // stays disarmed so it doesn't keep retrying and re-logging.
      const mutable = makeSpan({ 'db.system': 'elasticsearch' })
      processor.onEnd(mutable)
      expect(mutable.attributes['db.namespace']).toBeUndefined()
    })
  })
})
