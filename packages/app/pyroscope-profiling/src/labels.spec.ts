import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProfilingLabels, withProfilingLabels } from './labels.ts'

const profiler = vi.hoisted(() => ({
  getWallLabels: vi.fn(() => ({}) as Record<string, string | number>),
  setWallLabels: vi.fn(),
}))
const runningProfiler = vi.hoisted(() => vi.fn())

vi.mock('./profiler.ts', () => ({ runningProfiler }))

const profilerRunning = () => {
  runningProfiler.mockReturnValue({ default: profiler })
}

describe('getProfilingLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runningProfiler.mockReturnValue(undefined)
    profiler.getWallLabels.mockReturnValue({})
  })

  it('is empty while profiling is off', () => {
    expect(getProfilingLabels()).toEqual({})
  })

  it('reports what the profiler is attaching', () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ job: 'cache-refresh' })

    expect(getProfilingLabels()).toEqual({ job: 'cache-refresh' })
  })

  it('is empty when the profiler refuses to report them', () => {
    profilerRunning()
    profiler.getWallLabels.mockImplementation(() => {
      throw new Error('contexts are not supported')
    })

    expect(getProfilingLabels()).toEqual({})
  })

  // The SDK hands back the live label object, which is also the one the open
  // scopes hold, so a caller writing to it would change what every later sample
  // carries and what closing an outer scope restores.
  it('is a copy, not the set the profiler is reading from', () => {
    profilerRunning()
    const live = { job: 'cache-refresh' }
    profiler.getWallLabels.mockReturnValue(live)

    getProfilingLabels().job = 'something-else'

    expect(live.job).toBe('cache-refresh')
  })
})

describe('withProfilingLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runningProfiler.mockReturnValue(undefined)
    profiler.getWallLabels.mockReturnValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the work and returns its result while profiling is off', async () => {
    const fn = vi.fn().mockResolvedValue('done')

    await expect(withProfilingLabels({ job: 'cache-refresh' }, fn)).resolves.toBe('done')

    expect(fn).toHaveBeenCalledOnce()
    expect(profiler.setWallLabels).not.toHaveBeenCalled()
  })

  it('attaches the labels for the duration of the work and puts the previous ones back', async () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ env: 'production' })
    const labelsSeenDuringWork: unknown[] = []

    const result = await withProfilingLabels({ job: 'cache-refresh', items: 20_000 }, async () => {
      // Across an await, which is where the profiler's async context has to
      // carry the labels for any of this to be worth doing.
      await Promise.resolve()
      labelsSeenDuringWork.push(profiler.setWallLabels.mock.calls.at(-1)?.[0])
      return 'done'
    })

    expect(result).toBe('done')
    expect(labelsSeenDuringWork).toEqual([
      { env: 'production', job: 'cache-refresh', items: 20_000 },
    ])
    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ env: 'production' })
  })

  // The profiler holds one label set for the whole process, so a call that put
  // back what it found on entry would unlabel the call still running and leave
  // its own labels on every sample taken after both had finished.
  it('hands the labels to the call still running rather than to the one that finished', async () => {
    profilerRunning()
    let releaseFirst = () => {}
    let releaseSecond = () => {}

    const first = withProfilingLabels(
      { job: 'first' },
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve
        }),
    )
    const second = withProfilingLabels(
      { job: 'second' },
      () =>
        new Promise<void>((resolve) => {
          releaseSecond = resolve
        }),
    )

    releaseFirst()
    await first

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ job: 'second' })

    releaseSecond()
    await second

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({})
  })

  // A key Pyroscope cannot read as a Prometheus name gets the whole series
  // rejected at ingest, which the exporter reports through `debug` and
  // swallows, so the samples would be paid for and never land.
  it('sanitizes the label names, the same as the init tags do', async () => {
    profilerRunning()

    await withProfilingLabels({ 'tenant-id': 'acme', '2nd-attempt': 1 }, () => 'done')

    expect(profiler.setWallLabels).toHaveBeenCalledWith({ tenant_id: 'acme', _2nd_attempt: 1 })
  })

  it('accepts a synchronous body', async () => {
    profilerRunning()

    await expect(withProfilingLabels({ job: 'sync' }, () => 42)).resolves.toBe(42)

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({})
  })

  it('restores the labels when the work throws, and rethrows it untouched', async () => {
    profilerRunning()
    profiler.getWallLabels.mockReturnValue({ env: 'production' })
    const failure = new Error('refresh failed')

    await expect(
      withProfilingLabels({ job: 'cache-refresh' }, () => Promise.reject(failure)),
    ).rejects.toBe(failure)

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ env: 'production' })
  })

  it('still runs the work when the profiler refuses the labels', async () => {
    profilerRunning()
    profiler.setWallLabels.mockImplementationOnce(() => {
      throw new Error('contexts are not supported')
    })
    const fn = vi.fn().mockResolvedValue('done')

    await expect(withProfilingLabels({ job: 'cache-refresh' }, fn)).resolves.toBe('done')

    expect(fn).toHaveBeenCalledOnce()
  })

  it('still returns the result when the profiler refuses to restore the labels', async () => {
    profilerRunning()
    profiler.setWallLabels.mockImplementation((labels) => {
      if (Object.keys(labels as object).length === 0) throw new Error('gone')
    })

    await expect(withProfilingLabels({ job: 'cache-refresh' }, () => 'done')).resolves.toBe('done')
  })

  // Each call holds only what it adds, so the one that finishes takes its own
  // labels with it. Holding the merged set instead would put the finished
  // call's labels straight back on when the one still running was re-applied.
  it('takes its own labels with it when it finishes inside another call', async () => {
    profilerRunning()
    let releaseOuter = () => {}
    let releaseInner = () => {}

    const outer = withProfilingLabels(
      { job: 'refresh' },
      () =>
        new Promise<void>((resolve) => {
          releaseOuter = resolve
        }),
    )
    const inner = withProfilingLabels(
      { tenant: 'acme' },
      () =>
        new Promise<void>((resolve) => {
          releaseInner = resolve
        }),
    )

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ job: 'refresh', tenant: 'acme' })

    releaseOuter()
    await outer

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({ tenant: 'acme' })

    releaseInner()
    await inner

    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({})
  })

  // The wall profiler opens every flush window with an empty context, so work
  // that outlives one interval would carry its labels through the first window
  // and none after it.
  it('puts the labels back after a flush window has dropped them', async () => {
    profilerRunning()
    vi.useFakeTimers()
    let release = () => {}
    const running = withProfilingLabels(
      { job: 'cache-refresh' },
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    profiler.getWallLabels.mockReturnValue({ job: 'cache-refresh' })
    profiler.setWallLabels.mockClear()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(profiler.setWallLabels).not.toHaveBeenCalled()

    profiler.getWallLabels.mockReturnValue({})
    await vi.advanceTimersByTimeAsync(1_000)

    expect(profiler.setWallLabels).toHaveBeenCalledWith({ job: 'cache-refresh' })

    release()
    await running
  })
})
