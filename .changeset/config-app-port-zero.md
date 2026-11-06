---
"@lokalise/config": patch
---

Accept `APP_PORT=0` in `createAppConfigSchema()`, so the OS can pick a free port (e.g. in tests). The range was 1-65535 and is now 0-65535. `REDIS_PORT` still requires 1-65535.
