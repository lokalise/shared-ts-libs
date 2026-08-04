---
"@lokalise/background-jobs-common": major
---

Automatically purge job data on successful completion to reduce Redis footprint.

For the new processor, add a `purgeJobDataOnSuccess` flag to the queue configuration
(`QueueConfiguration`); for the deprecated processor, add it to the processor config
(`BackgroundJobProcessorConfig`). The flag defaults to `true`: after a job completes
successfully (and after the `onSuccess` hook runs), its data is purged down to `metadata`,
keeping only the `correlationId`. Set `purgeJobDataOnSuccess: false` to preserve the full
job data in Redis. Jobs already configured with `removeOnComplete` remain unaffected.

Purging now happens automatically, so the previously `protected` `purgeJobData` method is now
`private`. Remove any manual `purgeJobData` calls from your `onSuccess` hooks.
