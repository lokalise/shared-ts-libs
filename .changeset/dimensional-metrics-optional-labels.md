---
"@lokalise/metrics-utils": minor
---

Add optional `labelNames` support to dimensional counter, gauge, and histogram metrics. Declare `labelNames` in the config and pass values via a `labels` sub-object on the measurement; omitting labels preserves the existing label-free behaviour.
