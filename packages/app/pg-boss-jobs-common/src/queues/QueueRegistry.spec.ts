import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { isPrecompiledSchema } from '../precompileUtils.ts'
import { BASE_JOB_PAYLOAD_SCHEMA } from '../types.ts'
import { QueueRegistry } from './QueueRegistry.ts'
import type { JobPayloadForQueue, JobPayloadInputForQueue, QueueConfiguration } from './types.ts'

const config = <QueueId extends string>(queueId: QueueId) =>
  ({ queueId, jobPayloadSchema: BASE_JOB_PAYLOAD_SCHEMA }) as const satisfies QueueConfiguration

describe('QueueRegistry', () => {
  it('throws when two queues share an id', () => {
    expect(() => new QueueRegistry([config('duplicate'), config('duplicate')])).toThrow(
      'Duplicate queue configuration with id "duplicate"',
    )
  })

  it('returns a copy of the registered config carrying a precompiled schema', () => {
    const main = config('main')
    const registry = new QueueRegistry([main, config('other')])

    const registered = registry.getQueueConfig('main')

    expect(registered).not.toBe(main)
    expect(registered.queueId).toBe('main')
    expect(isPrecompiledSchema(registered.jobPayloadSchema)).toBe(true)
    expect(isPrecompiledSchema(main.jobPayloadSchema)).toBe(false)
  })

  it('throws when asked for an unregistered queue', () => {
    const registry = new QueueRegistry([config('main')])

    // @ts-expect-error - only registered queue ids are accepted
    expect(() => registry.getQueueConfig('missing')).toThrow(
      'Queue with id missing is not supported',
    )
  })

  it('lists every registered queue', () => {
    const registry = new QueueRegistry([config('first'), config('second')])

    expect(registry.queueIds).toEqual(['first', 'second'])
    expect(registry.all().map((queue) => queue.queueId)).toEqual(['first', 'second'])
  })

  it('infers payload types per queue', () => {
    const queues = [
      {
        queueId: 'email',
        jobPayloadSchema: BASE_JOB_PAYLOAD_SCHEMA.extend({
          to: z.string(),
          retries: z.number().default(0),
        }),
      },
      config('report'),
    ] as const satisfies QueueConfiguration[]
    const registry = new QueueRegistry(queues)

    expectTypeOf(registry.getQueueConfig).parameter(0).toEqualTypeOf<'email' | 'report'>()
    expectTypeOf<JobPayloadForQueue<typeof queues, 'email'>>().toEqualTypeOf<{
      to: string
      retries: number
      metadata: { correlationId: string }
    }>()
    expectTypeOf<JobPayloadInputForQueue<typeof queues, 'email'>>().toEqualTypeOf<{
      to: string
      retries?: number | undefined
      metadata: { correlationId: string }
    }>()
  })
})
