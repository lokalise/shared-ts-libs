# pg-boss jobs common

Background jobs on [pg-boss](https://github.com/timgit/pg-boss), with the queue configuration, payload validation,
logging, error reporting and transaction tracing of `@lokalise/background-jobs-common`. Jobs live in Postgres, so they
can be scheduled inside the caller's own database transaction.

The surface follows `@lokalise/background-jobs-common` where the two backends allow it:

| `@lokalise/background-jobs-common`  | `@lokalise/pg-boss-jobs-common`                                                    |
|-------------------------------------|------------------------------------------------------------------------------------|
| `QueueConfiguration`                | `QueueConfiguration`, with pg-boss `queueOptions` and `jobOptions`                 |
| `QueueManager`                      | `PgBossQueueManager`: `start`, `dispose`, `schedule`, `scheduleBulk`, `getSpy`, `getJobCount` |
| `AbstractBackgroundJobProcessorNew` | `AbstractPgBossJobProcessor`: `process(job, requestContext)`, `onSuccess`, `onFailed` |
| none                                | `AbstractPgBossBatchJobProcessor`: `process(jobs, requestContext)`, settled per job |
| `AbstractPeriodicJob`               | `PgBossQueueManager.scheduleRecurring`, on pg-boss's own cron and RRULE scheduler  |
| `UnrecoverableError`, `MutedUnrecoverableError` | the same names, recognized from either package                         |
| `BASE_JOB_PAYLOAD_SCHEMA`, `RequestContext` | the same shapes                                                            |

## Getting started

```shell
pnpm install
docker compose up -d --wait
pnpm run test
```

## Usage

```typescript
const supportedQueues = [
  {
    queueId: 'send-email',
    jobPayloadSchema: BASE_JOB_PAYLOAD_SCHEMA.extend({ emailId: z.uuid() }),
    queueOptions: { retryLimit: 3, retryDelay: 5, retryBackoff: true },
  },
] as const satisfies QueueConfiguration[]
type SendEmailPayload = JobPayloadForQueue<typeof supportedQueues, 'send-email'>

const queueManager = new PgBossQueueManager(
  supportedQueues,
  {
    isTest: false,
    pgBossOptions: { connectionString: config.db.url, schema: 'pgboss' },
  },
  { logger, errorReporter },
)
await queueManager.start()
await queueManager.provisionQueues()

class SendEmailProcessor extends AbstractPgBossJobProcessor<typeof supportedQueues, 'send-email'> {
  constructor(dependencies: PgBossJobProcessorDependencies<typeof supportedQueues>) {
    super(dependencies, { queueId: 'send-email', ownerName: 'notifications' })
  }

  protected async process(job: PgBossJob<SendEmailPayload>, requestContext: RequestContext) {
    requestContext.logger.info({ emailId: job.data.emailId }, 'Sending email')
  }
}

const processor = new SendEmailProcessor({
  queueManager,
  logger,
  errorReporter,
  transactionObservabilityManager,
})
await processor.start()

const jobId = await queueManager.schedule('send-email', {
  emailId: randomUUID(),
  metadata: { correlationId: requestContext.reqId },
})
```

### Queue configuration

- **`queueId`**: the pg-boss queue name.
- **`jobPayloadSchema`**: the Zod schema every payload is parsed with, when scheduled and again before `process` runs.
  It is precompiled on registration exactly as in `@lokalise/background-jobs-common`; see its README on schema
  precompilation for the trade-offs.
- **`queueOptions`**: pg-boss [queue options](https://timgit.github.io/pg-boss/api/queues): `policy`, retries,
  expiration, retention. Applied by `provisionQueues`. Jobs inherit them unless they override them.
- **`jobOptions`**: defaults for every job on the queue, or a function of the parsed payload, for example to derive a
  `singletonKey` or a `group`. Options passed to `schedule` win over them.

Every queue gets a dead letter queue named `<queueId>-dlq` (see `deadLetterQueueNameBuilder`).

### Provisioning

`provisionQueues` creates each queue and its dead letter queue, and applies `queueOptions` to queues that already
exist. It is safe to run on every deploy. `policy` and `partition` are fixed when a queue is created: pg-boss refuses
to change them later.

A service whose runtime role may not run DDL can pass `migrate: false` and `createSchema: false` in `pgBossOptions`,
and run pg-boss migrations plus `provisionQueues` from a release script instead.

### Scheduling inside a transaction

Pass a `db` from the caller's transaction, and the job becomes visible only once that transaction commits:

```typescript
import { fromDrizzle } from 'pg-boss'

await db.transaction(async (tx) => {
  await tx.insert(emails).values(email)
  await queueManager.schedule('send-email', payload, { db: fromDrizzle(tx, sql) })
})
```

pg-boss ships adapters for Drizzle (both the node-postgres and the postgres-js driver), Kysely, Knex and Prisma.
`scheduleBulk` takes the same `db` option, and a `jobOptions` value or function for per-job options:

```typescript
await queueManager.scheduleBulk('send-email', payloads, {
  db: fromDrizzle(tx, sql),
  jobOptions: (payload) => ({ singletonKey: payload.emailId, group: { id: ownerId } }),
})
```

`schedule` throws when pg-boss drops a job because a queue policy or a singleton option rejected it.

### Recurring jobs

pg-boss schedules recurring jobs itself, once across every running instance, so there is no `AbstractPeriodicJob`
counterpart and no lock to manage:

```typescript
await queueManager.scheduleRecurring('cleanup', '0 3 * * *', payload, { tz: 'Europe/Riga', key: 'nightly' })
await queueManager.scheduleRecurring('report', 'FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17', payload)
await queueManager.unscheduleRecurring('cleanup', 'nightly')
```

The payload is validated against the queue's schema. The schedule fires only on instances started with the `schedule`
pg-boss option, which is on by default.

## Processing jobs

Both processor classes validate each payload before it reaches `process`, and settle every job of a fetched batch on
its own outcome.

| Outcome                                       | What happens                                              |
|-----------------------------------------------|-----------------------------------------------------------|
| `process` succeeds                            | The job completes; its return value is stored as `output` |
| `process` throws                              | The job fails and is retried per the queue's settings     |
| `process` throws an `UnrecoverableError`      | The job goes straight to the dead letter queue            |
| The payload fails `jobPayloadSchema`          | The job goes straight to the dead letter queue            |

Every failure is stored as the job's `output`, and pg-boss keeps it when the job moves to the dead letter queue, so the
`job` table says why a job failed.

### Logging, error reporting and tracing

These match `@lokalise/background-jobs-common`, so existing dashboards and monitors carry over:

- each job, or each batch, runs as one `bg_job:<ownerName>:<queueId>` transaction of the
  `transactionObservabilityManager`, failed when the job failed;
- `requestContext.logger` carries `jobId`, `jobName` and `x-request-id` (the payload's `correlationId`), and logs
  `Started job <queueId>`, `<queueId> try failed` and `Finished job <queueId>` with `isSuccess`;
- errors reach the `errorReporter` with `jobId`, `jobName`, `x-request-id` and `errorJson` in the context.

One difference: a failed attempt is logged every time, but reaches the error reporter only once the job is out of
retries (or fails with an `UnrecoverableError`, or has an invalid payload). A `MutedUnrecoverableError` never does.

pg-boss also emits its own OpenTelemetry spans and metrics; configure them with the `openTelemetry` pg-boss option.

### One job at a time: `AbstractPgBossJobProcessor`

`process(job, requestContext)` handles a single job. With a `batchSize` above 1 in `workerOptions`, the jobs of a batch
run concurrently, each with its own request context and transaction.

`onSuccess` runs after `process` succeeds, and `onFailed` once the job has failed for good. A hook that throws is logged
and reported, and does not change the job's outcome. pg-boss persists the outcome once the whole batch is handled, so
the job is still `active` while a hook runs.

### Whole batches: `AbstractPgBossBatchJobProcessor`

For work that is cheaper in bulk, `process(jobs, requestContext)` gets the whole batch and says which jobs failed:

```typescript
protected async process(jobs, requestContext): Promise<BatchOutcome> {
  try {
    await this.indexer.bulkIndex(jobs.map((job) => job.data.documentId))
    return allJobsSucceeded(jobs)
  } catch (error) {
    if (!(error instanceof PerDocumentError)) throw error

    return someJobsFailed(jobs, new Map(error.failures.map((failure) => [jobIdFor(failure), failure.error])))
  }
}
```

- Return `someJobsFailed(jobs, failedJobs)` for failures you can pin on individual jobs. Only those fail; the rest
  of the batch completes, and each failed job keeps its own error and its own retry count.
- Throw when the failure cannot be pinned on anything (the store is down, the read every job needs failed), and the
  whole batch fails. A batch-wide failure stores a short `{ name, message }` summary as each job's `output`, since
  pg-boss would serialize the full error once per job.
- Key `failedJobs` by `job.id` and account for every job. An outcome that does not match the batch fails the whole
  batch as if `process` had thrown: pg-boss ignores an id it never handed out, so a mis-keyed failure would otherwise
  complete the very jobs it meant to fail.

The batch shares one request context, tagged with the first correlation id in it and bound to every job id and
correlation id of the batch.

### Transactional workers

pg-boss can run a handler and the job's completion in one transaction (`work(name, { transactional: true }, ...)`).
That cannot be combined with the per-job settlement both processors are built on, because one transaction has one
outcome, so `PgBossWorkerOptions` leaves `transactional` out. Use `queueManager.boss.work` directly for such a worker.

## Shutdown order

Dispose processors before the manager. `processor.dispose()` waits for the batch in flight while pg-boss is still up.
The reverse order costs retries: stopping pg-boss fails the batch that is running and aborts its handler.

With `opinionated-machine`, give processors a lower `asyncDisposePriority` than the manager, and a higher
`asyncInitPriority`.

## Testing

With `isTest: true` the manager enables pg-boss job spies, retries
failed jobs immediately (no retry delay, no backoff), and processors poll every 500ms:

```typescript
const jobId = await queueManager.schedule('send-email', payload)
const job = await processor.spy.waitForJobWithId(jobId, 'completed')
```

Spy states are pg-boss's: `created`, `active`, `completed` and `failed`. A spy reports `failed` after every failed
attempt, including one that will be retried.

`getJobCount(queueId)` returns the jobs still waiting, retrying or running, read from the job table, which makes it
suitable for waiting until a queue drains.

## Not carried over from `@lokalise/background-jobs-common`

- **Barriers**: pg-boss covers the usual reasons for one with queue policies (`singleton`, `stately`, `exclusive`),
  `groupConcurrency` and throttled sends.
- **Purging job data on success**: completed jobs are deleted by pg-boss after the queue's `deleteAfterSeconds`.
- **Job logs**: pg-boss has no per-job log; the request context logger writes to the service log only.
- **Flows**: use `queueManager.boss.flow` for jobs that depend on each other.
- **Bull Dashboard grouping**: pg-boss has its own dashboard, `@pg-boss/dashboard`.
