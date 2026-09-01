import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { QueueConfigRegistry } from './managers/QueueRegistry.ts'
import type { QueueConfiguration } from './managers/types.ts'
import {
  isPrecompiledSchema,
  type NonPrecompiledSchema,
  type PrecompiledSchema,
  precompileSchema,
} from './precompileUtils.ts'

const JOB_PAYLOAD_SCHEMA = z.object({
  id: z.string(),
  metadata: z.object({ correlationId: z.string() }),
})
type JobPayload = z.infer<typeof JOB_PAYLOAD_SCHEMA>

const VALID_PAYLOAD: JobPayload = { id: 'job-1', metadata: { correlationId: 'correlation-1' } }

describe('precompileSchema', () => {
  it('leaves the original schema alone and returns a precompiled clone', () => {
    const precompiled = precompileSchema(JOB_PAYLOAD_SCHEMA)

    expect(precompiled).not.toBe(JOB_PAYLOAD_SCHEMA)
    expect(isPrecompiledSchema(JOB_PAYLOAD_SCHEMA)).toBe(false)
    expect(isPrecompiledSchema(precompiled)).toBe(true)
  })

  it('parses exactly like the schema it was built from', () => {
    const precompiled = precompileSchema(JOB_PAYLOAD_SCHEMA)

    expect(precompiled.parse(VALID_PAYLOAD)).toEqual(JOB_PAYLOAD_SCHEMA.parse(VALID_PAYLOAD))
    expect(precompiled.safeParse({ id: 1, metadata: { correlationId: 'c' } }).success).toBe(false)
    expect(() => precompiled.parse({})).toThrow(z.ZodError)
  })

  it('is idempotent', () => {
    const precompiled = precompileSchema(JOB_PAYLOAD_SCHEMA)

    expect(precompileSchema(precompiled)).toBe(precompiled)
  })

  it('hands back schemas that zod refuses to compile, still usable', async () => {
    const asyncSchema = z.string().refine(async (value) => value.length > 0)

    const precompiled = precompileSchema(asyncSchema)

    expect(precompiled).toBe(asyncSchema)
    expect(isPrecompiledSchema(asyncSchema)).toBe(false)
    // second call short-circuits on the cache instead of asking zod again
    expect(precompileSchema(asyncSchema)).toBe(asyncSchema)
    await expect(precompiled.parseAsync('a')).resolves.toBe('a')
  })

  it('does not expose the marker as an enumerable property', () => {
    const precompiled = precompileSchema(JOB_PAYLOAD_SCHEMA)

    expect(Object.keys(precompiled)).toEqual(Object.keys(JOB_PAYLOAD_SCHEMA))
    expect(JSON.stringify(precompiled)).toEqual(JSON.stringify(JOB_PAYLOAD_SCHEMA))
  })
})

describe('queue configuration registration', () => {
  const queues = [
    { queueId: 'queue1', jobPayloadSchema: JOB_PAYLOAD_SCHEMA },
  ] as const satisfies QueueConfiguration[]

  it('precompiles the payload schema of every registered queue', () => {
    const registry = new QueueConfigRegistry(queues)

    const { jobPayloadSchema } = registry.getQueueConfig('queue1')

    expect(isPrecompiledSchema(jobPayloadSchema)).toBe(true)
    expect(jobPayloadSchema.parse(VALID_PAYLOAD)).toEqual(VALID_PAYLOAD)
  })

  it('keeps the configuration it was given untouched', () => {
    new QueueConfigRegistry(queues)

    expect(isPrecompiledSchema(queues[0].jobPayloadSchema)).toBe(false)
    expect(new QueueConfigRegistry(queues).getQueueConfig('queue1')).toMatchObject({
      queueId: 'queue1',
    })
  })

  it('carries the rest of the configuration over to the stored copy', () => {
    const fullQueues = [
      {
        queueId: 'queue1',
        jobPayloadSchema: JOB_PAYLOAD_SCHEMA,
        bullDashboardGrouping: ['service', 'module'],
        purgeJobDataOnSuccess: false,
        queueOptions: { skipMetasUpdate: true },
        jobOptions: { attempts: 10 },
      },
    ] as const satisfies QueueConfiguration[]

    const config = new QueueConfigRegistry(fullQueues).getQueueConfig('queue1')

    expect(config).toEqual({ ...fullQueues[0], jobPayloadSchema: config.jobPayloadSchema })
  })
})

describe('precompilation types', () => {
  const PRECOMPILED_JOB_PAYLOAD_SCHEMA = precompileSchema(JOB_PAYLOAD_SCHEMA)

  it('keeps the input and output types of the schema it was built from', () => {
    expectTypeOf<z.output<typeof PRECOMPILED_JOB_PAYLOAD_SCHEMA>>().toEqualTypeOf<JobPayload>()
    expectTypeOf<z.input<typeof PRECOMPILED_JOB_PAYLOAD_SCHEMA>>().toEqualTypeOf<
      z.input<typeof JOB_PAYLOAD_SCHEMA>
    >()
  })

  it('marks the result as precompiled', () => {
    expectTypeOf(PRECOMPILED_JOB_PAYLOAD_SCHEMA).toExtend<PrecompiledSchema<unknown>>()
    expectTypeOf(JOB_PAYLOAD_SCHEMA).not.toExtend<PrecompiledSchema<unknown>>()
  })

  it('accepts a plain schema on a queue configuration', () => {
    expectTypeOf(JOB_PAYLOAD_SCHEMA).toExtend<QueueConfiguration['jobPayloadSchema']>()
    expectTypeOf<NonPrecompiledSchema<typeof JOB_PAYLOAD_SCHEMA>>().toExtend<
      QueueConfiguration['jobPayloadSchema']
    >()
  })

  it('refuses an already precompiled schema on a queue configuration', () => {
    expectTypeOf(PRECOMPILED_JOB_PAYLOAD_SCHEMA).not.toExtend<
      QueueConfiguration['jobPayloadSchema']
    >()

    const config: QueueConfiguration = {
      queueId: 'queue1',
      // @ts-expect-error the library precompiles registered schemas, so pass the original one
      jobPayloadSchema: PRECOMPILED_JOB_PAYLOAD_SCHEMA,
    }

    expect(config.queueId).toBe('queue1')
  })
})
