---
"@lokalise/fastify-bullboard-plugin": major
---

Upgrade `@bull-board/api` and `@bull-board/fastify` to 9, which adds BullMQ 6 support and ships a redesigned
dashboard UI.

`QueueConstructor` no longer declares the third constructor parameter. BullMQ 6 replaced it (`Connection`) with
a `BackendFactory`, and the plugin never passed it, so the type now matches `QueueProConstructor` and accepts
BullMQ's `Queue` on both majors.
