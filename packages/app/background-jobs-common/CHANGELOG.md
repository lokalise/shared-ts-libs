# @lokalise/background-jobs-common

## 14.4.1

### Patch Changes

- 4f87da7: Stop logging BullMQ control-flow errors (`DelayedError`, `WaitingChildrenError`, `RateLimitError`) as job attempt failures. These errors are cooperative signals a processor throws after `moveToDelayed`/`moveToWaitingChildren`/`rateLimit` to hand the job back to BullMQ, not real failures. They now emit a `"<jobName> deferred via <ErrorName>"` debug log instead of the `"<jobName> try failed"` error log.

## 14.4.0

### Minor Changes

- 50f6ceb: Add `FlowManager` and `FakeFlowManager` to support BullMQ `FlowProducer` with the same guarantees as `QueueManager`: typed payload-per-queue, Zod validation, merged job options + default retry/retention, deduplication `idBuilder` on root jobs, dashboard grouping via `bullDashboardGrouping`, spy support in test mode, and lazy initialization. `FlowManager` is paired with a `QueueManager` (passed to the constructor) and shares its registry and spy instances — so `queueManager.getSpy('x')`, `flowManager.getSpy('x')`, and a processor's spy all observe the same job lifecycle. A `FlowManager` paired with a `ModuleAwareQueueManager` inherits its `[serviceId, moduleId]` grouping automatically — no separate `ModuleAwareFlowManager` is needed. Adds the `BullmqFlowProducerFactory` interface, `CommonBullmqFactoryNew.buildFlowProducer`, and exposes `QueueManager.queueRegistry` publicly.
