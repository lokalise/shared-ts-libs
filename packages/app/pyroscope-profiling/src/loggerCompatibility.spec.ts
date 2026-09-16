import type { CommonLogger } from '@lokalise/node-core'
import type { FastifyBaseLogger } from 'fastify'
import { describe, expect, it } from 'vitest'
import type { ProfilingLogger } from './types.ts'

/**
 * {@link ProfilingLogger} exists so this package needs no logging dependency,
 * which is only worth anything if the loggers callers actually hold satisfy it,
 * and if it in turn satisfies the Pyroscope SDK's own `Logger`. All three are
 * structural, so a compile error here is the whole test: `pnpm run lint` runs
 * `tsc` over this file.
 */
describe('ProfilingLogger', () => {
  it('accepts the loggers a Lokalise service already has', () => {
    const fromNodeCore: ProfilingLogger = undefined as unknown as CommonLogger
    const fromFastify: ProfilingLogger = undefined as unknown as FastifyBaseLogger
    // The SDK does not export its `Logger` interface, so the contract is read
    // off the one function that consumes it.
    type SdkLogger = Parameters<typeof import('@pyroscope/nodejs').default.setLogger>[0]
    const acceptedBySdk: SdkLogger = undefined as unknown as ProfilingLogger

    expect([fromNodeCore, fromFastify, acceptedBySdk]).toHaveLength(3)
  })
})
