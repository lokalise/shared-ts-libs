# @lokalise/config

Shared [envase](https://www.npmjs.com/package/envase) config schemas for Lokalise services, so services stop
redefining the same env vars. Each function returns a schema to put into envase's `createConfig()`.

`envase` (2.x) and `zod` (4.x) are peer dependencies. The types of the parsed values are inferred from the schemas.

## `createAppConfigSchema()`

Reads `NODE_ENV`, `APP_ENV`, `APP_VERSION`, `GIT_COMMIT_SHA`, `APP_BIND_ADDRESS` (default `0.0.0.0`), `APP_PORT`
(default `3000`), `JWT_PUBLIC_KEY` (`||` stands for a newline), `LOG_LEVEL` (default `info`), `BASE_URL` (default
empty), `METRICS_ENABLED` (default `true`) and `GRACEFUL_SHUTDOWN_TIMEOUT_MS` (default `10000`, at most `30000`). The
parsed value is an `AppConfig`.

## `createRedisConfigSchema(options?)`

Reads `REDIS_HOST`, `REDIS_PORT` (default `6379`), `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_USE_TLS` (default
`true`), `REDIS_DB` (0-15), `REDIS_KEY_PREFIX`, `REDIS_COMMAND_TIMEOUT` and `REDIS_CONNECT_TIMEOUT`. The password
is redacted from validation errors.

The parsed value is ioredis `RedisOptions`. `REDIS_USE_TLS` becomes `tls: {}`, or `undefined` when disabled, so you can
pass the value to `new Redis()` or as a BullMQ `connection` without converting it. Settings that are code rather than
config, such as `retryStrategy`, `reconnectOnError` or BullMQ's `maxRetriesPerRequest: null`, are left to the caller.

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
