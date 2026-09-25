import { describe, expect, it } from 'vitest'
import { refuseProfilingOnWindows } from './profiling.ts'

describe('refuseProfilingOnWindows', () => {
  it('refuses on win32, naming the process and the way out', () => {
    expect(() => refuseProfilingOnWindows('service', { platform: 'win32' })).toThrow(
      /cannot profile service started on Windows.*WSL2.*on-a-windows-dev-box/s,
    )
  })

  it('appends the hint to the way out', () => {
    expect(() =>
      refuseProfilingOnWindows('service', { platform: 'win32', hint: 'pass --no-service' }),
    ).toThrow('start service yourself in WSL2 or its container and pass --no-service.')
  })

  it.each(['linux', 'darwin'] as const)('lets %s through', (platform) => {
    expect(() => refuseProfilingOnWindows('service', { platform })).not.toThrow()
  })
})
