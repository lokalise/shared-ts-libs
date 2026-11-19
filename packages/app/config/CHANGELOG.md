# @lokalise/config

## 1.0.3

### Patch Changes

- 3a3f97d: Accept `APP_PORT=0` in `createAppConfigSchema()`, so the OS can pick a free port (e.g. in tests). The range was 1-65535 and is now 0-65535. `REDIS_PORT` still requires 1-65535.

## 1.0.2

### Patch Changes

- d7d3869: Require `envase` 2.1.0 or later as a peer dependency. The type declarations reference `EnvvarEntry`, which `envase` exports only from 2.1.0, so on 2.0.0 the parsed config fields were silently typed as `any`.

## 1.0.1

### Patch Changes

- d7e3853: List `NODE_ENV` values as `production`, `test`, `development` and `APP_ENV` values as `production`, `staging`, `development`, ordered by how close each is to production, as node-service-template does. Accepted values and inferred types are unchanged; only the order in generated env var docs changes.

## 1.0.0

### Major Changes

- fbe6dbe: Initial release of `@lokalise/config`, shared envase config schemas:
  
  - `createAppConfigSchema()`, parsing the common app settings into `AppConfig`
  - `createRedisConfigSchema({ prefix })`, reading `[<prefix>_]REDIS_*` env vars and parsing into ioredis `RedisOptions`, with `REDIS_USE_TLS` turned into `tls`
