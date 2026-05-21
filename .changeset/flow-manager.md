---
"@lokalise/background-jobs-common": minor
---

Add `FlowManager`, `FakeFlowManager` and `ModuleAwareFlowManager` to support BullMQ `FlowProducer` with the same guarantees as `QueueManager`: typed payload-per-queue, Zod validation, merged job options + default retry/retention, deduplication `idBuilder` on root jobs, dashboard grouping via `bullDashboardGrouping`, spy support in test mode, and lazy initialization. Adds `BullmqFlowProducerFactory` interface and `CommonBullmqFactoryNew.buildFlowProducer`.
