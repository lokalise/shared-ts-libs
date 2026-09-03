# @lokalise/background-jobs-common

## 16.1.0

### Minor Changes

- 8fb5c28: Preserve `details` from wrapped errors' `cause` chain when reporting to Bugsnag. Previously, an
  error's own `details` (e.g. an HTTP response body captured on a lower-level `ResponseStatusError`)
  were lost once that error was wrapped as the `cause` of another error, since Bugsnag reporting only
  read the top-level error's `details`. Bugsnag reports now include an `err` metadata field built
  with `pino-std-serializers`' `errWithCause`, carrying the full cause chain along with `details`,
  `errorCode`, and any other custom error properties at every level (replacing the previous flat
  `errorDetails`/`errorCode`/`causeDetails` fields).
  
  `@lokalise/error-utils` now uses the native `Error.isError` and requires Node `>=24.3.0` (declared
  via `engines.node`), a breaking change for consumers on older Node versions.
  
  `AbstractBackgroundJobProcessor` and `AbstractBackgroundJobProcessorNew` no longer serialize
  errors into the `context` passed to the error reporter (dropping the `errorJson`/`error` context
  fields), since Bugsnag reporting now serializes the full error (including `cause`) itself; a
  consumer using a different `ErrorReporter` implementation will see less data in `context` than
  before. Non-`Error` values thrown from `onSuccess`/`onFailed` hooks are still reported via a
  `nonErrorValue` context field, since in that case the `error` passed to the reporter is a synthetic
  placeholder with nothing for a reporter to extract.

## 16.0.0

### Major Changes

- b1dcde7: Precompile registered job payload schemas and require `zod` >= 4.5.0.
  
  The `jobPayloadSchema` of every `QueueConfiguration` is now compiled ahead of time when the configuration is
  registered, so payload validation in `QueueManager`, `FlowManager` and the job processors takes zod's generated
  fast path instead of the interpreted parser. A schema zod refuses to compile (an async refinement or a recursive
  schema) keeps using the regular parser.
  
  Three consequences to be aware of:
  
  - The `zod` peer range moves from `>=3.25.67` to `>=4.5.0 <5.0.0`, since 4.5 is where `z.compile` landed.
  - Parse results are unchanged, but the fast path only signals that input is invalid, so zod re-runs the original
    parser to build the error. A synchronous `refine`, `superRefine` or `transform` therefore runs twice for a payload
    that fails validation, which is observable when such a callback has a side effect outside the parse.
    `z.config({ jitless: true })` turns precompilation off.
  - `getQueueConfig()` returns a shallow copy of the registered configuration carrying the compiled schema, not the
    object that was passed in. The config and schema you registered are left untouched, and the compiled schema is
    absent from any zod registry the original was added to.

## 15.2.0

### Minor Changes

- b52200e: Support BullMQ 6 and ioredis 6 alongside 5. `background-jobs-common` widens its peer ranges to
  `^5.28.2 || ^6.0.0` (bullmq) and `^5.4.1 || ^6.0.0` (ioredis); `healthcheck-utils` widens its ioredis peer
  to `^5.4.1 || ^6.0.0`.
  
  BullMQ 6 removes `paused` from `JobType`, drops `debounce` and `repeat` from `JobsOptions`, and renames the
  `FlowChildJob` type to `FlowJobNode`. The library now derives the flow child type from `FlowJob` and deletes the
  removed job options through a record, so one source tree compiles against both majors. `getJobCount` still counts
  the `paused` state; on BullMQ 6 that key is never written and contributes 0.

## 15.1.0

### Minor Changes

- 2b868cd: Job execution now runs within the observability context of the transaction started for it, when the provided `TransactionObservabilityManager` implements the optional `runInSpanContext` (as the OpenTelemetry manager from `@lokalise/fastify-extras` does). Spans produced while a job runs are attached to the job transaction instead of becoming detached roots. Both persisted and periodic jobs also report their outcome to `stop()` now, so a failed job is no longer recorded as successful - jobs deferred via a BullMQ control-flow error still count as successful. Requires `@lokalise/node-core` >= 14.9.1, which declares `runInSpanContext` and provides the `runInTransactionContext` helper used to apply it.

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
