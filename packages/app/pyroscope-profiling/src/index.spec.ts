import { describe, expect, it } from 'vitest'
import * as fastifyEntryPoint from './fastify.ts'
import * as mainEntryPoint from './index.ts'
import * as openTelemetryEntryPoint from './opentelemetry.ts'

/**
 * The three entry points are separate so that a consumer without Fastify or the
 * tracing SDK can still use the main one, which only holds if nothing leaks
 * across. Dropping an export from a barrel is also the kind of edit that breaks
 * nothing else in this package.
 */
describe('entry points', () => {
  it('exports the profiler, the environment readers and the label helpers', () => {
    expect(Object.keys(mainEntryPoint).sort()).toEqual([
      'getProfilingLabels',
      'isProfilingRunning',
      'isSpanProfilingEnabledInEnv',
      'resolveProfilingConfigFromEnv',
      'resolveProfilingContextFromEnv',
      'runningProfiler',
      'startProfiling',
      'stopProfiling',
      'withProfilingLabels',
    ])
  })

  it('exports the span processor only from the OpenTelemetry entry point', () => {
    expect(Object.keys(openTelemetryEntryPoint).sort()).toEqual([
      'PyroscopeSpanProcessor',
      'buildPyroscopeSpanProcessors',
    ])
  })

  it('exports the plugin only from the Fastify entry point', () => {
    expect(Object.keys(fastifyEntryPoint)).toEqual(['pyroscopeProfilingPlugin'])
  })
})
