---
"@lokalise/background-jobs-common": minor
---

Add `FlowManager` and `FakeFlowManager` to support BullMQ `FlowProducer` with the same guarantees as `QueueManager`: typed payload-per-queue, Zod validation, merged job options + default retry/retention, deduplication `idBuilder` on root jobs, dashboard grouping via `bullDashboardGrouping`, spy support in test mode, and lazy initialization. `FlowManager` reads queue configs from a shared `QueueConfigRegistry` (the one already owned by `QueueManager`), so a `FlowManager` paired with a `ModuleAwareQueueManager` inherits its `[serviceId, moduleId]` grouping automatically — no separate `ModuleAwareFlowManager` is needed. Adds the `BullmqFlowProducerFactory` interface, `CommonBullmqFactoryNew.buildFlowProducer`, the `applyModuleGrouping` helper for standalone publish-only callers, and exposes `QueueManager.queueRegistry` publicly.
