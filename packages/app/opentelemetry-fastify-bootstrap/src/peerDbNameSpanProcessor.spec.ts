import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { describe, expect, it } from 'vitest'
import { PeerDbNameSpanProcessor } from './peerDbNameSpanProcessor.ts'

function makeSpan(attributes: Record<string, unknown>): ReadableSpan {
  // Minimal ReadableSpan stand-in. We only need the mutable `attributes` map
  // because that's the sole surface the processor touches.
  return { attributes } as unknown as ReadableSpan
}

describe('PeerDbNameSpanProcessor', () => {
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
