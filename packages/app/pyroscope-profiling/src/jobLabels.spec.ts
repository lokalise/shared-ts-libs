import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withJobLabels } from './jobLabels.ts'

const profiler = vi.hoisted(() => ({
  getWallLabels: vi.fn(() => ({}) as Record<string, string | number>),
  setWallLabels: vi.fn(),
}))
const runningProfiler = vi.hoisted(() => vi.fn())

vi.mock('./profiler.ts', () => ({ runningProfiler }))

describe('withJobLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runningProfiler.mockReturnValue({ default: profiler })
    profiler.getWallLabels.mockReturnValue({})
  })

  it('labels the samples taken while the job runs with its queue', async () => {
    await withJobLabels('cache-refresh', () => undefined)

    expect(profiler.setWallLabels).toHaveBeenCalledWith({ job: 'cache-refresh' })
  })

  it('carries extra labels alongside the queue', async () => {
    await withJobLabels('cache-refresh', () => undefined, { tenant: 'acme' })

    expect(profiler.setWallLabels).toHaveBeenCalledWith({ job: 'cache-refresh', tenant: 'acme' })
  })

  // The queue is the one label a flame graph is cut by, so a caller passing
  // `job` in the extras must not be able to point it somewhere else.
  it('keeps the queue as the job label when the extras name one too', async () => {
    await withJobLabels('cache-refresh', () => undefined, { job: 'something-else' })

    expect(profiler.setWallLabels).toHaveBeenCalledWith({ job: 'cache-refresh' })
  })

  it('returns what the job returns', async () => {
    await expect(withJobLabels('cache-refresh', () => 'done')).resolves.toBe('done')
  })

  it('rethrows what the job throws, and still puts the labels back', async () => {
    const boom = new Error('boom')

    await expect(
      withJobLabels('cache-refresh', () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(profiler.setWallLabels).toHaveBeenLastCalledWith({})
  })
})
