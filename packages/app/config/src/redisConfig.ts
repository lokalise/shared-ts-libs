import { envvar, type InferEnv } from 'envase'
import { z } from 'zod'

export type RedisConfigSchemaOptions = {
  /**
   * Prepends `<prefix>_` to every env var name, so `SCHEDULER` reads `SCHEDULER_REDIS_HOST`
   * instead of `REDIS_HOST`. Use a different prefix for each additional Redis connection.
   */
  prefix?: string
}

/**
 * Returns the Redis connection schema for envase's `createConfig()`.
 *
 * The parsed value is ioredis options, ready for `new Redis()`. For a BullMQ `connection`, leave
 * out `keyPrefix` and pass it as BullMQ's `prefix` option, since BullMQ doesn't support ioredis
 * key prefixes.
 *
 * @example
 * ```typescript
 * import { createRedisConfigSchema } from '@lokalise/config'
 * import { createConfig } from 'envase'
 * import { Redis } from 'ioredis'
 *
 * const config = createConfig(process.env, {
 *   schema: {
 *     redis: createRedisConfigSchema(),
 *     scheduler: createRedisConfigSchema({ prefix: 'SCHEDULER' }),
 *   },
 * })
 *
 * const client = new Redis(config.redis)
 * ```
 */
export const createRedisConfigSchema = (options?: RedisConfigSchemaOptions) => {
  const namePrefix = options?.prefix ? `${options.prefix}_REDIS` : 'REDIS'

  return {
    host: envvar(`${namePrefix}_HOST`, z.string().min(1).describe('Redis server hostname')),
    port: envvar(
      `${namePrefix}_PORT`,
      z.coerce.number().int().min(1).max(65535).default(6379).describe('Redis server port'),
    ),
    username: envvar(
      `${namePrefix}_USERNAME`,
      z.string().optional().describe('Redis authentication username'),
    ),
    password: envvar(
      `${namePrefix}_PASSWORD`,
      z.string().optional().describe('Redis authentication password'),
      { sensitive: true },
    ),
    tls: envvar(
      `${namePrefix}_USE_TLS`,
      z
        .stringbool()
        .default(true)
        .transform((useTls) => (useTls ? {} : undefined))
        // The transform output can't be expressed in JSON schema, so describe the env var for docs
        .meta({
          description: 'Whether to use TLS/SSL for the Redis connection',
          type: 'boolean',
          default: true,
        }),
    ),
    db: envvar(
      `${namePrefix}_DB`,
      z.coerce.number().int().min(0).max(15).optional().describe('Redis database number (0-15)'),
    ),
    keyPrefix: envvar(
      `${namePrefix}_KEY_PREFIX`,
      z.string().optional().describe('Prefix for all Redis keys'),
    ),
    commandTimeout: envvar(
      `${namePrefix}_COMMAND_TIMEOUT`,
      z.coerce
        .number()
        .int()
        .gte(0)
        .optional()
        .describe('Command execution timeout in milliseconds'),
    ),
    connectTimeout: envvar(
      `${namePrefix}_CONNECT_TIMEOUT`,
      z.coerce
        .number()
        .int()
        .gte(0)
        .optional()
        .describe('Initial connection timeout in milliseconds'),
    ),
  }
}

/**
 * The ioredis connection options parsed from `createRedisConfigSchema()`. Settings that are code
 * rather than config, such as `retryStrategy` or `maxRetriesPerRequest`, are left to the caller.
 */
export type RedisConfig = InferEnv<ReturnType<typeof createRedisConfigSchema>>
