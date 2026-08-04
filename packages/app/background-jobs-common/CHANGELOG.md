# @lokalise/background-jobs-common

## 15.0.0

### Major Changes

- 52a2d81: Automatically purge job data on successful completion to reduce Redis footprint.

  For the new processor, add a `purgeJobDataOnSuccess` flag to the queue configuration
  (`QueueConfiguration`); for the deprecated processor, add it to the processor config
  (`BackgroundJobProcessorConfig`). The flag defaults to `true`: after a job completes
  successfully (and after the `onSuccess` hook runs), its data is purged down to `metadata`,
  keeping only the `correlationId`. Set `purgeJobDataOnSuccess: false` to preserve the full
  job data in Redis. Jobs already configured with `removeOnComplete` remain unaffected.

  Purging now happens automatically, so the previously `protected` `purgeJobData` method is now
  `private`. Remove any manual `purgeJobData` calls from your `onSuccess` hooks.

## 14.4.2

### Patch Changes

- 9f48046: Update dependencies, including `@lokalise/node-core` to 14.8.1 and `redis-semaphore` to 5.7.0.

## 14.4.1

### Patch Changes

- 4f87da7: Stop logging BullMQ control-flow errors (`DelayedError`, `WaitingChildrenError`, `RateLimitError`) as job attempt failures. These errors are cooperative signals a processor throws after `moveToDelayed`/`moveToWaitingChildren`/`rateLimit` to hand the job back to BullMQ, not real failures. They now emit a `"<jobName> deferred via <ErrorName>"` debug log instead of the `"<jobName> try failed"` error log.

## 14.4.0

### Minor Changes

- 50f6ceb: Add `FlowManager` and `FakeFlowManager` to support BullMQ `FlowProducer` with the same guarantees as `QueueManager`: typed payload-per-queue, Zod validation, merged job options + default retry/retention, deduplication `idBuilder` on root jobs, dashboard grouping via `bullDashboardGrouping`, spy support in test mode, and lazy initialization. `FlowManager` is paired with a `QueueManager` (passed to the constructor) and shares its registry and spy instances — so `queueManager.getSpy('x')`, `flowManager.getSpy('x')`, and a processor's spy all observe the same job lifecycle. A `FlowManager` paired with a `ModuleAwareQueueManager` inherits its `[serviceId, moduleId]` grouping automatically — no separate `ModuleAwareFlowManager` is needed. Adds the `BullmqFlowProducerFactory` interface, `CommonBullmqFactoryNew.buildFlowProducer`, and exposes `QueueManager.queueRegistry` publicly.
