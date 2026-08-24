---
"@lokalise/background-jobs-common": minor
"@lokalise/healthcheck-utils": minor
---

Support BullMQ 6 and ioredis 6 alongside 5. `background-jobs-common` widens its peer ranges to
`^5.28.2 || ^6.0.0` (bullmq) and `^5.4.1 || ^6.0.0` (ioredis); `healthcheck-utils` widens its ioredis peer
to `^5.4.1 || ^6.0.0`.

BullMQ 6 removes `paused` from `JobType`, drops `debounce` and `repeat` from `JobsOptions`, and renames the
`FlowChildJob` type to `FlowJobNode`. The library now derives the flow child type from `FlowJob` and deletes the
removed job options through a record, so one source tree compiles against both majors. `getJobCount` still counts
the `paused` state; on BullMQ 6 that key is never written and contributes 0.
