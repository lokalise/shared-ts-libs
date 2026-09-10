---
"@lokalise/fastify-bullboard-plugin": patch
---

Align the `@bull-board/api` range with `@bull-board/fastify` so both resolve to the same 9.x release. The two ranges had drifted far enough apart that a fresh install picked up mismatched copies of `@bull-board/api`, whose `BaseAdapter` types are not interchangeable across versions.
