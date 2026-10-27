# @lokalise/config

## 1.0.1

### Patch Changes

- d7e3853: List `NODE_ENV` values as `production`, `test`, `development` and `APP_ENV` values as `production`, `staging`, `development`, ordered by how close each is to production, as node-service-template does. Accepted values and inferred types are unchanged; only the order in generated env var docs changes.

## 1.0.0

### Major Changes

- fbe6dbe: Initial release of `@lokalise/config`, shared envase config schemas:
  
  - `createAppConfigSchema()`, parsing the common app settings into `AppConfig`
  - `createRedisConfigSchema({ prefix })`, reading `[<prefix>_]REDIS_*` env vars and parsing into ioredis `RedisOptions`, with `REDIS_USE_TLS` turned into `tls`
