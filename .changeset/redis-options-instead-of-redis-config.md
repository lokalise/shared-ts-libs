---
"@lokalise/background-jobs-common": patch
"@lokalise/fastify-bullboard-plugin": patch
---

Type Redis connection settings as ioredis `RedisOptions` instead of the deprecated `RedisConfig` from `@lokalise/node-core`, so a TLS connection can be configured with `tls`. This covers `redisConfig` in `QueueManager`, the job processors, `FakeBackgroundJobProcessor`, `backgroundJobProcessorGetActiveQueueIds`, `enrichRedisConfig`, `sanitizeRedisConfig` and the bull-board plugin's `redisConfigs`. The bull-board plugin now declares `ioredis` ^6.0.0, which it already imported, as a peer dependency.

`useTls` was never read: these packages pass the config to ioredis and BullMQ as it is, so `useTls: true` did not turn TLS on. Drop `useTls`, and set `tls: {}` where you want TLS. `createRedisConfigSchema()` from `@lokalise/config` reads the config from env vars and sets `tls: {}` when `REDIS_USE_TLS` is true, so a connection built from it with `REDIS_USE_TLS=true` uses TLS, which it did not before.
