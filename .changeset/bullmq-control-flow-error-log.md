---
"@lokalise/background-jobs-common": patch
---

Stop logging BullMQ control-flow errors (`DelayedError`, `WaitingChildrenError`, `RateLimitError`) as job attempt failures. These errors are cooperative signals a processor throws after `moveToDelayed`/`moveToWaitingChildren`/`rateLimit` to hand the job back to BullMQ, not real failures. They now emit a `"<jobName> deferred via <ErrorName>"` debug log instead of the `"<jobName> try failed"` error log.
