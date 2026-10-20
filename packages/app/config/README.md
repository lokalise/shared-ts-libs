# @lokalise/config

Shared [envase](https://www.npmjs.com/package/envase) config schemas for Lokalise services, so services stop
redefining the same env vars. Each function returns a schema to put into envase's `createConfig()`.

`envase` (2.x) and `zod` (4.x) are peer dependencies. The types of the parsed values are inferred from the schemas.

## `createAppConfigSchema()`

The parsed value is an `AppConfig`.

| Env var                        | Required | Default   | Notes                                                          |
|--------------------------------|----------|-----------|----------------------------------------------------------------|
| `NODE_ENV`                     | yes      |           | `production`, `development` or `test`                          |
| `APP_ENV`                      | yes      |           | `production`, `development` or `staging`                       |
| `APP_VERSION`                  | yes      |           |                                                                |
| `GIT_COMMIT_SHA`               | yes      |           |                                                                |
| `APP_BIND_ADDRESS`             | no       | `0.0.0.0` |                                                                |
| `APP_PORT`                     | no       | `3000`    | 1-65535                                                        |
| `LOG_LEVEL`                    | no       | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `BASE_URL`                     | no       | empty     |                                                                |
| `METRICS_ENABLED`              | no       | `true`    |                                                                |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | no       | `10000`   | At most `30000`                                                |

## `createRedisConfigSchema(options?)`

The parsed value is ioredis `RedisOptions`, so you can pass it to `new Redis()` without converting it. Settings that
are code rather than config, such as `retryStrategy`, `reconnectOnError` or BullMQ's `maxRetriesPerRequest: null`, are
left to the caller.

| Env var                 | Required | Default | Notes                                |
|-------------------------|----------|---------|--------------------------------------|
| `REDIS_HOST`            | yes      |         |                                      |
| `REDIS_PORT`            | no       | `6379`  | 1-65535                              |
| `REDIS_USERNAME`        | no       |         |                                      |
| `REDIS_PASSWORD`        | no       |         | Redacted from validation errors      |
| `REDIS_USE_TLS`         | no       | `true`  | Parsed into `tls: {}` or `undefined` |
| `REDIS_DB`              | no       |         | 0-15                                 |
| `REDIS_KEY_PREFIX`      | no       |         |                                      |
| `REDIS_COMMAND_TIMEOUT` | no       |         | Milliseconds                         |
| `REDIS_CONNECT_TIMEOUT` | no       |         | Milliseconds                         |

BullMQ doesn't support ioredis key prefixes. For a BullMQ `connection`, leave `keyPrefix` out and pass it as BullMQ's
`prefix` option:

```typescript
const { keyPrefix, ...connection } = config.redis
const queue = new Queue('jobs', { connection, prefix: keyPrefix })
```

For each additional connection, pass a different `prefix`. It goes in front of `REDIS`, so `{ prefix: 'SCHEDULER' }` reads
`SCHEDULER_REDIS_HOST`, `SCHEDULER_REDIS_PORT` and so on.

## Example

```typescript
import { createAppConfigSchema, createRedisConfigSchema } from '@lokalise/config'
import { createConfig, envvar } from 'envase'
import { Redis } from 'ioredis'
import { z } from 'zod'

const config = createConfig(process.env, {
  schema: {
    app: { ...createAppConfigSchema(), jwtPrivateKey: envvar('JWT_PRIVATE_KEY', z.string()) },
    redis: createRedisConfigSchema(),
    scheduler: createRedisConfigSchema({ prefix: 'SCHEDULER' }),
  },
})

const client = new Redis({ ...config.redis, maxRetriesPerRequest: null })
```

To change one setting, replace its entry, for example to make the key prefix required:

```typescript
const redisSchema = {
  ...createRedisConfigSchema(),
  keyPrefix: envvar('REDIS_KEY_PREFIX', z.string().min(1)),
}
```
