---
"@lokalise/background-jobs-common": major
"@lokalise/fastify-bullboard-plugin": major
---

Type Redis connection settings as ioredis `RedisOptions` instead of the deprecated `RedisConfig` from `@lokalise/node-core`. This covers `redisConfig` in `QueueManager`, the job processors, `FakeBackgroundJobProcessor`, `backgroundJobProcessorGetActiveQueueIds`, `enrichRedisConfig`, `sanitizeRedisConfig` and the bull-board plugin's `redisConfigs`. The bull-board plugin now declares `ioredis` ^6.0.0, which it already imported, as a peer dependency.

`useTls` was never read: these packages pass the config to ioredis and BullMQ as it is, so `useTls: true` did not turn TLS on. An object literal that still sets `useTls` is now a type error. To migrate, drop `useTls`, and set `tls: {}` where you want TLS. `createRedisConfigSchema()` from `@lokalise/config` reads the config from env vars and sets `tls: {}` when `REDIS_USE_TLS` is true. If you build a connection from `REDIS_USE_TLS=true` with that schema, TLS turns on for that connection, which it was not before.
