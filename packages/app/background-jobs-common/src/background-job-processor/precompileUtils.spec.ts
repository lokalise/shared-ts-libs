import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { QueueConfigRegistry } from './managers/QueueRegistry.ts'
import type { QueueConfiguration } from './managers/types.ts'
import { isPrecompiledSchema, precompileSchema } from './precompileUtils.ts'

const PRECOMPILED_SCHEMA_MARKER = Symbol.for('@lokalise/background-jobs-common/precompiledSchema')

// Precompilation is memoized per schema object, so every test builds its own instead of sharing one.
const buildJobPayloadSchema = () =>
  z.object({
    id: z.string(),
    metadata: z.object({ correlationId: z.string() }),
  })

type JobPayload = z.infer<ReturnType<typeof buildJobPayloadSchema>>

const VALID_PAYLOAD: JobPayload = { id: 'job-1', metadata: { correlationId: 'correlation-1' } }

describe('precompileSchema', () => {
  it('leaves the original schema alone and returns a precompiled clone', () => {
    const schema = buildJobPayloadSchema()

    const precompiled = precompileSchema(schema)

    expect(precompiled).not.toBe(schema)
    expect(isPrecompiledSchema(schema)).toBe(false)
    expect(isPrecompiledSchema(precompiled)).toBe(true)
  })

  it('parses exactly like the schema it was built from', () => {
    const schema = buildJobPayloadSchema()

    const precompiled = precompileSchema(schema)

    expect(precompiled.parse(VALID_PAYLOAD)).toEqual(schema.parse(VALID_PAYLOAD))
    expect(precompiled.safeParse({ id: 1, metadata: { correlationId: 'c' } }).success).toBe(false)
    expect(() => precompiled.parse({})).toThrow(z.ZodError)
  })

  it('compiles a given schema once', () => {
    const schema = buildJobPayloadSchema()

    const precompiled = precompileSchema(schema)

    expect(precompileSchema(schema)).toBe(precompiled)
    expect(precompileSchema(precompiled)).toBe(precompiled)
  })

  it('hands back a schema with an async refinement, still usable', async () => {
    const asyncSchema = z.string().refine(async (value) => value.length > 0)

    const precompiled = precompileSchema(asyncSchema)

    expect(precompiled).toBe(asyncSchema)
    expect(isPrecompiledSchema(asyncSchema)).toBe(false)
    // second call short-circuits on the cache instead of asking zod again
    expect(precompileSchema(asyncSchema)).toBe(asyncSchema)
    await expect(precompiled.parseAsync('a')).resolves.toBe('a')
  })

  it('hands back a recursive schema, still usable', () => {
    const recursiveSchema = z.object({
      id: z.string(),
      get children() {
        return z.array(recursiveSchema)
      },
    })

    const precompiled = precompileSchema(recursiveSchema)

    expect(precompiled).toBe(recursiveSchema)
    expect(isPrecompiledSchema(precompiled)).toBe(false)
    expect(precompiled.parse({ id: 'a', children: [{ id: 'b', children: [] }] })).toEqual({
      id: 'a',
      children: [{ id: 'b', children: [] }],
    })
  })

  it('compiles nothing while zod is configured jitless', () => {
    const schema = buildJobPayloadSchema()
    const previousJitless = z.config().jitless

    try {
      z.config({ jitless: true })

      const precompiled = precompileSchema(schema)

      expect(precompiled).toBe(schema)
      expect(isPrecompiledSchema(precompiled)).toBe(false)
    } finally {
      z.config({ jitless: previousJitless })
    }

    // the refusal is not cached: the same schema compiles once the flag is cleared
    expect(isPrecompiledSchema(precompileSchema(schema))).toBe(true)
  })

  it('keeps the marker off the original schema and out of enumeration', () => {
    const schema = buildJobPayloadSchema()

    const precompiled = precompileSchema(schema)

    expect(Object.getOwnPropertyDescriptor(precompiled, PRECOMPILED_SCHEMA_MARKER)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    })
    expect(Object.getOwnPropertySymbols(schema)).not.toContain(PRECOMPILED_SCHEMA_MARKER)
    expect(Object.keys(precompiled)).toEqual(Object.keys(schema))
    expect(JSON.stringify(precompiled)).toEqual(JSON.stringify(schema))
  })

  it('runs a synchronous refinement twice for input that fails validation', () => {
    // The generated fast path only signals that input is invalid, so the original parser reruns to
    // build the error. The README and UPGRADING notes say so; this test keeps them honest.
    let calls = 0
    const schema = z.object({
      id: z.string().refine(() => {
        calls++
        return false
      }),
    })

    schema.safeParse({ id: 'a' })
    const runtimeCalls = calls

    calls = 0
    precompileSchema(schema).safeParse({ id: 'a' })

    expect(runtimeCalls).toBe(1)
    expect(calls).toBe(2)
  })

  it('runs a synchronous refinement once for input that passes validation', () => {
    let calls = 0
    const schema = z.object({
      id: z.string().refine(() => {
        calls++
        return true
      }),
    })

    precompileSchema(schema).safeParse({ id: 'a' })

    expect(calls).toBe(1)
  })
})

describe('queue configuration registration', () => {
  it('precompiles the payload schema of every registered queue', () => {
    const queues = [
      { queueId: 'queue1', jobPayloadSchema: buildJobPayloadSchema() },
    ] as const satisfies QueueConfiguration[]

    const registry = new QueueConfigRegistry(queues)

    const { jobPayloadSchema } = registry.getQueueConfig('queue1')

    expect(isPrecompiledSchema(jobPayloadSchema)).toBe(true)
    expect(jobPayloadSchema.parse(VALID_PAYLOAD)).toEqual(VALID_PAYLOAD)
  })

  it('keeps the configuration it was given untouched', () => {
    const queues = [
      { queueId: 'queue1', jobPayloadSchema: buildJobPayloadSchema() },
    ] as const satisfies QueueConfiguration[]

    const config = new QueueConfigRegistry(queues).getQueueConfig('queue1')

    expect(config).not.toBe(queues[0])
    expect(config.jobPayloadSchema).not.toBe(queues[0].jobPayloadSchema)
    expect(isPrecompiledSchema(queues[0].jobPayloadSchema)).toBe(false)
  })

  it('compiles a schema shared by several queues once', () => {
    const jobPayloadSchema = buildJobPayloadSchema()
    const queues = [
      { queueId: 'queue1', jobPayloadSchema },
      { queueId: 'queue2', jobPayloadSchema },
    ] as const satisfies QueueConfiguration[]

    const registry = new QueueConfigRegistry(queues)

    expect(registry.getQueueConfig('queue1').jobPayloadSchema).toBe(
      registry.getQueueConfig('queue2').jobPayloadSchema,
    )
    // a second registry reuses the same clone rather than compiling again
    expect(new QueueConfigRegistry(queues).getQueueConfig('queue1').jobPayloadSchema).toBe(
      registry.getQueueConfig('queue1').jobPayloadSchema,
    )
  })

  it('carries the rest of the configuration over to the stored copy', () => {
    const fullQueues = [
      {
        queueId: 'queue1',
        jobPayloadSchema: buildJobPayloadSchema(),
        bullDashboardGrouping: ['service', 'module'],
        purgeJobDataOnSuccess: false,
        queueOptions: { skipMetasUpdate: true },
        jobOptions: { attempts: 10 },
      },
    ] as const satisfies QueueConfiguration[]

    const config = new QueueConfigRegistry(fullQueues).getQueueConfig('queue1')

    expect(config).toEqual({
      ...fullQueues[0],
      jobPayloadSchema: precompileSchema(fullQueues[0].jobPayloadSchema),
    })
  })
})
