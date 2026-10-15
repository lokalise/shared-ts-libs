---
'@lokalise/config': major
---

Initial release of `@lokalise/config`, shared envase config schemas:

- `createAppConfigSchema()`, parsing the common app settings into `AppConfig`
- `createRedisConfigSchema({ prefix })`, reading `[<prefix>_]REDIS_*` env vars and parsing into ioredis `RedisOptions`, with `REDIS_USE_TLS` turned into `tls`
