# Purge job data on success — design

## Context

`background-jobs-common` exposes a protected `purgeJobData(job)` on both processors
(`AbstractBackgroundJobProcessorNew` and the deprecated `AbstractBackgroundJobProcessor`).
It strips a completed job down to `metadata` (keeping `correlationId`) and clears its logs,
so finished jobs don't keep occupying space in Redis.

Today purging is fully manual: a consumer must call `purgeJobData` inside its own
`onSuccess` hook. Most consumers don't, so completed jobs retain their full `data` in Redis.

## Goal

Add a config flag that, when enabled (default `true`), automatically purges job data after
a job completes successfully — reducing Redis footprint without requiring every consumer to
opt in manually.

## Design

### 1. Config

Add an optional flag to both processor config types (`processors/types.ts`):

- `BackgroundJobProcessorConfigNew`
- `BackgroundJobProcessorConfig` (deprecated — kept for parity)

```ts
/**
 * When enabled (default), job data is automatically purged after a successful run,
 * keeping only `metadata`. Set to `false` to preserve full job data in Redis.
 */
purgeJobDataOnSuccess?: boolean
```

Semantics: enabled unless explicitly `false`. i.e. `config.purgeJobDataOnSuccess !== false`,
so `undefined` (the common case) means **purge**.

### 2. Behaviour

In `internalOnSuccess` of both processors, after the consumer's `onSuccess` hook has run via
`internalOnHook` (so the hook still sees the complete `job.data`):

```ts
private async internalOnSuccess(job: JobType): Promise<void> {
  const requestContext = this.monitor.getRequestContext(job)
  this._spy?.addJob(job, 'completed')
  await this.internalOnHook(job, requestContext, (job, rc) => this.onSuccess(job, rc))

  if (this.config.purgeJobDataOnSuccess !== false) {
    await this.internalOnHook(job, requestContext, (job) => this.purgeJobData(job))
  }
}
```

The purge is wrapped the same way hook errors are handled (`internalOnHook`), so a purge
failure is reported to `errorReporter` and never crashes the completion flow.
`purgeJobData` already no-ops when `removeOnComplete` is `true`/`1` (BullMQ removes the job
itself in that case).

### 3. Tests

New cases (New processor spec, mirrored where relevant for the deprecated one):

- Auto-purges by default on success (data reduced to `metadata`).
- No purge when `purgeJobDataOnSuccess: false` (full data preserved).
- The `onSuccess` hook still observes the full `job.data` (purge runs after the hook).
- Still respects `removeOnComplete` (no purge attempt / no error).

The Fake/Test processors are extended to accept an optional config override so both modes can
be exercised. Existing tests that assert full `job.data` after completion are updated to pass
`purgeJobDataOnSuccess: false` (or adjusted), since the default now purges.

### 4. Versioning

One changeset for `@lokalise/background-jobs-common`, **minor**. The summary must call out the
default behaviour change (job data is purged on success unless disabled). `metadata` /
`correlationId` are preserved.

## Out of scope

- No change to failure-path purging.
- No change to `purgeJobData`'s own logic beyond being invoked automatically.
