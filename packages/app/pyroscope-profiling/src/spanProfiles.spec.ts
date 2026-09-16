import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPyroscopeSpanProcessors, PyroscopeSpanProcessor } from './spanProfiles.ts'

const profiler = vi.hoisted(() => ({
  getWallLabels: vi.fn(() => ({}) as Record<string, string | number>),
  setWallLabels: vi.fn(),
}))
const runningProfiler = vi.hoisted(() => vi.fn())

vi.mock('./profiler.ts', () => ({ runningProfiler }))

const profilerRunning = () => {
  runningProfiler.mockReturnValue({ default: profiler })
}

/**
 * The two halves of a span this processor touches: its identity and the one
 * attribute it writes.
 */
function fakeSpan(spanId: string, name = 'GET /v1/env', parentSpanId?: string) {
  const setAttribute = vi.fn()
  const span = {
    name,
    spanContext: () => ({ spanId, traceId: 'trace' }),
    setAttribute,
    ...(parentSpanId ? { parentSpanContext: { spanId: parentSpanId } } : {}),
  }
  return { span: span as unknown as Span & ReadableSpan, setAttribute }
}

describe('PyroscopeSpanProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runningProfiler.mockReturnValue(undefined)
    profiler.getWallLabels.mockReturnValue({})
  })

  it('labels the profiler with the span it is inside, and the span with the profile', () => {
    profilerRunning()
    const processor = new PyroscopeSpanProcessor()
    const { span, setAttribute } = fakeSpan('span-1', 'POST /v1/content/refresh')

    processor.onStart(span)

    expect(profiler.setWallLabels).toHaveBeenCalledWith({
      span_id: 'span-1',
      span_name: 'POST /v1/content/refresh',
    })
    expect(setAttribute).toHaveBeenCalledWith('pyroscope.profile.id', 'span-1')
  })

  it('keeps the labels the profiler already carried', () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ env: 'development' })
    const processor = new PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')

    processor.onStart(span)

    expect(profiler.setWallLabels).toHaveBeenCalledWith({
      env: 'development',
      span_id: 'span-1',
      span_name: 'GET /v1/env',
    })
  })

  it('puts them back when the span ends', () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ env: 'development' })
    const processor = new PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')

    processor.onStart(span)
    processor.onEnd(span)

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ env: 'development' })
  })

  it('leaves a child span alone: it shares the async context its parent labelled', () => {
    profilerRunning()
    const processor = new PyroscopeSpanProcessor()
    const { span, setAttribute } = fakeSpan('span-2', 'pg.query', 'span-1')

    processor.onStart(span)
    processor.onEnd(span)

    expect(profiler.setWallLabels).not.toHaveBeenCalled()
    expect(setAttribute).not.toHaveBeenCalled()
  })

  it('does nothing while the profiler is not running, which is every environment with it off', () => {
    const processor = new PyroscopeSpanProcessor()
    const { span, setAttribute } = fakeSpan('span-1')

    processor.onStart(span)
    processor.onEnd(span)

    expect(profiler.setWallLabels).not.toHaveBeenCalled()
    expect(setAttribute).not.toHaveBeenCalled()
  })

  it('keeps serving spans when the profiler throws at them', () => {
    profilerRunning()
    profiler.setWallLabels.mockImplementationOnce(() => {
      throw new Error('contexts are not supported')
    })
    const warn = vi.fn()
    const processor = new PyroscopeSpanProcessor({ warn } as never)
    const { span } = fakeSpan('span-1')

    expect(() => processor.onStart(span)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('keeps serving spans when the profiler throws while labels are restored', () => {
    profilerRunning()
    const processor = new PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')
    processor.onStart(span)
    profiler.setWallLabels.mockImplementationOnce(() => {
      throw new Error('contexts are not supported')
    })

    expect(() => processor.onEnd(span)).not.toThrow()
  })

  it('forgets the spans it is holding when it shuts down', async () => {
    profilerRunning()
    const processor = new PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')

    processor.onStart(span)
    await processor.shutdown()
    processor.onEnd(span)

    // Only the label set by onStart: nothing was restored afterwards.
    expect(profiler.setWallLabels).toHaveBeenCalledTimes(1)
  })

  it('buffers nothing, so a forced flush resolves immediately', async () => {
    await expect(new PyroscopeSpanProcessor().forceFlush()).resolves.toBeUndefined()
  })

  // A span that never reaches onEnd would otherwise hold its entry forever, so
  // the map is dropped rather than grown. Nothing is restorable at that point:
  // every entry belongs to a span that is not coming back.
  it('stops tracking spans once it is holding more than it will ever restore', () => {
    profilerRunning()
    const processor = new PyroscopeSpanProcessor()
    const spans = Array.from({ length: 1025 }, (_, index) => fakeSpan(`span-${index}`))
    for (const { span } of spans) processor.onStart(span)

    // The 1025th start cleared the map, so only that span can still be restored.
    profiler.setWallLabels.mockClear()
    for (const { span } of spans) processor.onEnd(span)

    expect(profiler.setWallLabels).toHaveBeenCalledOnce()
  })
})

describe('buildPyroscopeSpanProcessors', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    runningProfiler.mockReturnValue(undefined)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns nothing unless both switches are on', () => {
    process.env.PYROSCOPE_ENABLED = 'true'
    process.env.PYROSCOPE_SPAN_PROFILES_ENABLED = 'false'

    expect(buildPyroscopeSpanProcessors()).toEqual([])
  })

  it('returns one processor when span profiles were asked for', () => {
    process.env.PYROSCOPE_ENABLED = 'true'
    process.env.PYROSCOPE_SPAN_PROFILES_ENABLED = 'true'

    const processors = buildPyroscopeSpanProcessors()

    expect(processors).toHaveLength(1)
    expect(processors[0]).toBeInstanceOf(PyroscopeSpanProcessor)
  })
})
