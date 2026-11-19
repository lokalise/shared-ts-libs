import { EnvaseError, parseEnv } from 'envase'
import type { RedisOptions } from 'ioredis'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createRedisConfigSchema, type RedisConfig } from './redisConfig.ts'

describe('createRedisConfigSchema', () => {
  it('parses every setting from REDIS_ env vars', () => {
    const config = parseEnv(
      {
        REDIS_HOST: 'redis.local',
        REDIS_PORT: '6380',
        REDIS_USERNAME: 'user',
        REDIS_PASSWORD: 'secret',
        REDIS_USE_TLS: 'false',
        REDIS_DB: '3',
        REDIS_KEY_PREFIX: 'polyglot:',
        REDIS_COMMAND_TIMEOUT: '500',
        REDIS_CONNECT_TIMEOUT: '1000',
      },
      createRedisConfigSchema(),
    )

    expect(config).toStrictEqual({
      host: 'redis.local',
      port: 6380,
      username: 'user',
      password: 'secret',
      tls: undefined,
      db: 3,
      keyPrefix: 'polyglot:',
      commandTimeout: 500,
      connectTimeout: 1000,
    })
  })

  it('defaults the port, enables TLS and leaves the optional settings unset', () => {
    const config = parseEnv({ REDIS_HOST: 'redis.local' }, createRedisConfigSchema())

    expect(config).toStrictEqual({
      host: 'redis.local',
      port: 6379,
      username: undefined,
      password: undefined,
      tls: {},
      db: undefined,
      keyPrefix: undefined,
      commandTimeout: undefined,
      connectTimeout: undefined,
    })
  })

  it('reads <prefix>_REDIS_ env vars when a prefix is given', () => {
    const config = parseEnv(
      {
        REDIS_HOST: 'main.local',
        SCHEDULER_REDIS_HOST: 'scheduler.local',
        SCHEDULER_REDIS_DB: '1',
      },
      createRedisConfigSchema({ prefix: 'SCHEDULER' }),
    )

    expect(config.host).toBe('scheduler.local')
    expect(config.db).toBe(1)
  })

  it.each([
    ['a missing host', {}],
    ['a database number above 15', { REDIS_HOST: 'redis.local', REDIS_DB: '16' }],
    ['a port that is not a number', { REDIS_HOST: 'redis.local', REDIS_PORT: 'abc' }],
    ['a negative timeout', { REDIS_HOST: 'redis.local', REDIS_COMMAND_TIMEOUT: '-1' }],
  ])('rejects %s', (_, env) => {
    expect(() => parseEnv(env, createRedisConfigSchema())).toThrow(EnvaseError)
  })

  it('documents REDIS_USE_TLS as a boolean defaulting to true', () => {
    const [, tlsSchema] = createRedisConfigSchema().tls

    // Same options envase's doc generator uses, which reads the type and default from the output
    const documented = tlsSchema['~standard'].jsonSchema.output({
      target: 'openapi-3.0',
      libraryOptions: { unrepresentable: 'any' },
    })

    expect(documented).toMatchObject({ type: 'boolean', default: true })
  })

  it('produces ioredis options', () => {
    expectTypeOf<RedisConfig>().toExtend<RedisOptions>()
  })
})
