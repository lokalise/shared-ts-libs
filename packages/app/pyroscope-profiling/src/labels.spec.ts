import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})

describe('withProfilingLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runningProfiler.mockReturnValue(undefined)
    profiler.getWallLabels.mockReturnValue({})
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
})
