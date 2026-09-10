---
"@lokalise/background-jobs-common": major
"@lokalise/healthcheck-utils": major
---

Require ioredis 6. The `ioredis` peer range narrows from `^5.4.1 || ^6.0.0` to `^6.0.0`, and `redis-semaphore` moves to `^5.8.0`, the first release that declares ioredis 6 support in its peer range. Consumers still on ioredis 5 need to upgrade before taking this version.
