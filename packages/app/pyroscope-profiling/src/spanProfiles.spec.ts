import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfilingLogger } from './types.ts'

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
 * The scopes the labels are tracked in are process-wide, as the profiler's own
 * labels are, so every test gets its own module instance rather than inheriting
 * the scopes the previous one left open.
 */
const loadModule = () => {
  vi.resetModules()
  return import('./spanProfiles.ts')
}

/**
 * The two halves of a span this processor touches: its identity and the one
 * attribute it writes.
 */
function fakeSpan(
  spanId: string,
  name = 'GET /v1/env',
  parentSpanContext?: { spanId: string; isRemote?: boolean },
) {
  const setAttribute = vi.fn()
  const span = {
    name,
    spanContext: () => ({ spanId, traceId: 'trace' }),
    setAttribute,
    ...(parentSpanContext ? { parentSpanContext } : {}),
  }
  return { span: span as unknown as Span & ReadableSpan, setAttribute }
}

describe('PyroscopeSpanProcessor', () => {
  let spanProfiles: typeof import('./spanProfiles.ts')

  beforeEach(async () => {
    vi.clearAllMocks()
    runningProfiler.mockReturnValue(undefined)
    profiler.getWallLabels.mockReturnValue({})
    spanProfiles = await loadModule()
  })

  it('labels the profiler with the span it is inside, and the span with the profile', () => {
    profilerRunning()
    const processor = new spanProfiles.PyroscopeSpanProcessor()
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
    const processor = new spanProfiles.PyroscopeSpanProcessor()
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
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')

    processor.onStart(span)
    processor.onEnd(span)

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ env: 'development' })
  })

  // The server span of a traced incoming request has a parent, and it is in the
  // caller's process. Reading that as a child leaves every service behind a
  // gateway or a traced upstream with no span labels at all.
  it('labels an incoming traced request, whose parent is in another process', () => {
    profilerRunning()
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const { span, setAttribute } = fakeSpan('span-2', 'GET /v1/env', {
      spanId: 'caller-span',
      isRemote: true,
    })

    processor.onStart(span)

    expect(profiler.setWallLabels).toHaveBeenCalledWith({
      span_id: 'span-2',
      span_name: 'GET /v1/env',
    })
    expect(setAttribute).toHaveBeenCalledWith('pyroscope.profile.id', 'span-2')
  })

  it('leaves a span with a local parent alone: the outer span already labelled the work', () => {
    profilerRunning()
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const { span, setAttribute } = fakeSpan('span-2', 'pg.query', { spanId: 'span-1' })

    processor.onStart(span)
    processor.onEnd(span)

    expect(profiler.setWallLabels).not.toHaveBeenCalled()
    expect(setAttribute).not.toHaveBeenCalled()
  })

  // The profiler holds one label set for the whole process, so a span that put
  // back what it found on start would leave the request still running
  // unlabelled, and its own id on every sample taken after both had ended.
  it('hands the labels to the request still open rather than to the one that ended', () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ env: 'development' })
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const first = fakeSpan('span-1', 'GET /a')
    const second = fakeSpan('span-2', 'GET /b')

    processor.onStart(first.span)
    processor.onStart(second.span)
    processor.onEnd(first.span)

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({
      env: 'development',
      span_id: 'span-2',
      span_name: 'GET /b',
    })

    processor.onEnd(second.span)

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ env: 'development' })
  })

  it('does nothing while the profiler is not running, which is every environment with it off', () => {
    const processor = new spanProfiles.PyroscopeSpanProcessor()
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
    const processor = new spanProfiles.PyroscopeSpanProcessor({ warn } as never)
    const { span } = fakeSpan('span-1')

    expect(() => processor.onStart(span)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('keeps serving spans when the profiler throws while labels are restored', () => {
    profilerRunning()
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')
    processor.onStart(span)
    profiler.setWallLabels.mockImplementationOnce(() => {
      throw new Error('contexts are not supported')
    })

    expect(() => processor.onEnd(span)).not.toThrow()
  })

  // A profiler that refuses labels refuses all of them, and at request rates
  // two warns per request cost more than the profiler being reported on.
  it('reports a labelling failure once, and the repeats at debug', () => {
    profilerRunning()
    profiler.setWallLabels.mockImplementation(() => {
      throw new Error('contexts are not supported')
    })
    const logger = { warn: vi.fn(), debug: vi.fn() } as unknown as ProfilingLogger
    const processor = new spanProfiles.PyroscopeSpanProcessor(logger)

    for (const { span } of [fakeSpan('span-1'), fakeSpan('span-2'), fakeSpan('span-3')]) {
      processor.onStart(span)
    }

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.debug).toHaveBeenCalledTimes(2)
  })

  it('puts the labels back for the spans it is still holding when it shuts down', async () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ env: 'development' })
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const { span } = fakeSpan('span-1')

    processor.onStart(span)
    await processor.shutdown()

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ env: 'development' })

    profiler.setWallLabels.mockClear()
    processor.onEnd(span)

    expect(profiler.setWallLabels).not.toHaveBeenCalled()
  })

  it('buffers nothing, so a forced flush resolves immediately', async () => {
    await expect(new spanProfiles.PyroscopeSpanProcessor().forceFlush()).resolves.toBeUndefined()
  })

  // A span that never reaches onEnd would otherwise hold its entry forever, so
  // the oldest is dropped to make room. It is the one least likely to still be
  // open, and the only one nothing can be restored for.
  it('stops tracking the oldest span once it is holding more than it will ever restore', () => {
    profilerRunning()
    const processor = new spanProfiles.PyroscopeSpanProcessor()
    const spans = Array.from({ length: 1025 }, (_, index) => fakeSpan(`span-${index}`))
    for (const { span } of spans) processor.onStart(span)

    profiler.setWallLabels.mockClear()
    for (const { span } of spans.slice(0, 1)) processor.onEnd(span)

    expect(profiler.setWallLabels).not.toHaveBeenCalled()

    for (const { span } of spans.slice(-1)) processor.onEnd(span)

    expect(profiler.setWallLabels).toHaveBeenCalledOnce()
  })
})

describe('buildPyroscopeSpanProcessors', () => {
  const originalEnv = { ...process.env }
  let spanProfiles: typeof import('./spanProfiles.ts')

  beforeEach(async () => {
    runningProfiler.mockReturnValue(undefined)
    spanProfiles = await loadModule()
    // The suite itself runs under NODE_ENV=test, which is off by definition.
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns nothing unless both switches are on', () => {
    process.env.PYROSCOPE_ENABLED = 'true'
    process.env.PYROSCOPE_SPAN_PROFILES_ENABLED = 'false'

    expect(spanProfiles.buildPyroscopeSpanProcessors()).toEqual([])
  })

  it('returns nothing under NODE_ENV=test, where nothing would be profiled anyway', () => {
    process.env.NODE_ENV = 'test'
    process.env.PYROSCOPE_ENABLED = 'true'
    process.env.PYROSCOPE_SPAN_PROFILES_ENABLED = 'true'

    expect(spanProfiles.buildPyroscopeSpanProcessors()).toEqual([])
  })

  it('returns one processor when span profiles were asked for', () => {
    process.env.PYROSCOPE_ENABLED = 'true'
    process.env.PYROSCOPE_SPAN_PROFILES_ENABLED = 'true'

    const processors = spanProfiles.buildPyroscopeSpanProcessors()

    expect(processors).toHaveLength(1)
    expect(processors[0]).toBeInstanceOf(spanProfiles.PyroscopeSpanProcessor)
  })
})
