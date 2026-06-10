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
    // Re-install no-op impls every test because vitest config `mockReset: true`
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

    it('throws when a mapping key is an empty string', () => {
      expect(() => new PeerDbNameSpanProcessor({ dbNames: { '': 'lokalise' } })).toThrow(
        /non-empty/,
      )
    })

    it('accepts an empty mapping object (no-op processor)', () => {
      // Constructing directly with an empty map should not throw — it's a
      // vacuous configuration, not an invalid one.
      expect(() => new PeerDbNameSpanProcessor({ dbNames: {} })).not.toThrow()
    })

    it('is unaffected by mutation of the options object after construction', () => {
      // The constructor copies validated entries; aliasing the caller's
      // object would let post-construction mutation bypass validation.
      const dbNames: Record<string, string> = { elasticsearch: 'lokalise' }
      const processor = new PeerDbNameSpanProcessor({ dbNames })

      dbNames.elasticsearch = ''
      dbNames.redis = 'cache'

      const esSpan = makeSpan({ 'db.system': 'elasticsearch' })
      processor.onEnd(esSpan)
      expect(esSpan.attributes['db.namespace']).toBe('lokalise')

      const redisSpan = makeSpan({ 'db.system': 'redis' })
      processor.onEnd(redisSpan)
      expect(redisSpan.attributes['db.namespace']).toBeUndefined()
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

    it('does not resolve db.system values through Object.prototype', () => {
      // A plain-record lookup would resolve 'constructor' to
      // Object.prototype.constructor and stamp a function as an attribute.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({ 'db.system': 'constructor' })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBeUndefined()
    })

    it('does nothing when both db.namespace and peer.db.system are already set', () => {
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const span = makeSpan({
        'db.system': 'elasticsearch',
        'db.namespace': 'already-there',
        'peer.db.system': 'elasticsearch',
      })

      processor.onEnd(span)

      expect(span.attributes['db.namespace']).toBe('already-there')
      expect(consoleLogSpy).not.toHaveBeenCalled()
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

    it('reports what was actually written when db.namespace was already present', () => {
      // The log must stay honest: if the namespace was pre-existing and only
      // peer.db.system was mirrored, it must not claim the mapped value was
      // stamped.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      processor.onEnd(makeSpan({ 'db.system': 'elasticsearch', 'db.namespace': 'pre-existing' }))

      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      const message = String(consoleLogSpy.mock.calls[0]?.[0])
      expect(message).toContain('"dbNamespace":"pre-existing"')
      expect(message).toContain('"stampedNamespace":false')
      expect(message).toContain('"stampedPeerDbSystem":true')
    })

    it('does not log when no spans match the mapping', () => {
      // A misconfigured mapping (typo in db.system key) should not produce
      // a "stamped" log — keeps the success signal honest.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsarch: 'lokalise' } })
      processor.onEnd(makeSpan({ 'db.system': 'elasticsearch' }))

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('mutation failures (future SDK upgrade guard)', () => {
    it('does not throw when span.attributes is frozen', () => {
      // Future @opentelemetry/sdk-trace-base versions may freeze attributes
      // on span end. A throw from onEnd would propagate into application
      // code and silently drop the span from export, so the processor must
      // log once and disarm instead.
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
      expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain('disabling further stamping')

      // A subsequent mutable span receives no stamp either — the processor
      // stays disarmed so it doesn't keep retrying and re-logging.
      const mutable = makeSpan({ 'db.system': 'elasticsearch' })
      processor.onEnd(mutable)
      expect(mutable.attributes['db.namespace']).toBeUndefined()
    })

    it('swallows non-TypeError assignment failures too, logging once and disarming', () => {
      // e.g. a Proxy-wrapped attributes object with a throwing set trap.
      const processor = new PeerDbNameSpanProcessor({ dbNames: { elasticsearch: 'lokalise' } })
      const throwing = new Proxy({ 'db.system': 'elasticsearch' } as Record<string, unknown>, {
        set() {
          throw new Error('custom failure')
        },
      })

      expect(() => processor.onEnd(makeSpan(throwing))).not.toThrow()
      expect(() => processor.onEnd(makeSpan(throwing))).not.toThrow()

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain('custom failure')
    })
  })
})
