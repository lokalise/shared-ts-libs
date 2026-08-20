---
"@lokalise/background-jobs-common": minor
---

Job execution now runs within the observability context of the transaction started for it, when the provided `TransactionObservabilityManager` implements the optional `runInSpanContext` (as the OpenTelemetry manager from `@lokalise/fastify-extras` does). Spans produced while a job runs are attached to the job transaction instead of becoming detached roots. Both persisted and periodic jobs also report their outcome to `stop()` now, so a failed job is no longer recorded as successful - jobs deferred via a BullMQ control-flow error still count as successful. Requires `@lokalise/node-core` >= 14.9.1, which declares `runInSpanContext` and provides the `runInTransactionContext` helper used to apply it.
