# Extracting scheduling from maestro into a shared library

Analysis date: 2026-09-02. Repositories inspected: `maestro`, `content-type-app-engine` (CTENG), `shared-ts-libs`. pg-boss facts checked against 12.29.0.

## Summary

- **CTENG already has a scheduling mechanism in production.** It stores schedules in Postgres with a `next_run_at` column, and a single-consumer periodic job ticks on a cron and dispatches whatever is due. Maestro uses BullMQ job schedulers with a custom RRULE repeat strategy. The two designs differ at every layer: recurrence model, next-occurrence engine, storage, trigger delivery, and execution tracking.
- **The layer worth sharing first is the recurrence engine**: a schedule definition plus "next occurrence after T in timezone Z". It is pure logic with no infrastructure dependency, and it is where both services carry the hardest code (DST, timezone conversion, start boundaries) and the most tests.
- **Trigger delivery goes behind one adapter interface with two implementations and a clear direction.** pg-boss is the target for both services: schedules fire from Postgres, survive Redis loss, and the next occurrence can be enqueued in the same transaction as the service's own write. BullMQ is a compatibility adapter so maestro can adopt the library without changing runtime behaviour on day one, and it is retired once maestro moves to pg-boss. There is no library-owned schedule table: the service's domain table stays the canonical registry, and the pending job is the runtime record.
- **pg-boss cannot compute custom recurrences natively** (its `schedule()` is cron only, minute granularity, no hook), so the library owns next-occurrence computation and drives pg-boss with a self-perpetuating chain of deferred jobs. Research against 12.29.0 confirms every operation in the model maps to a public API: deferred `send`, `singletonKey` under the `short` queue policy, `upsert` and `findJobs` by key, and transactional `send` through `fromDrizzle`. No upstream change is a prerequisite. The chain is a workaround, though, and the section "Upstream pg-boss API proposals" lays out changes (pluggable recurrence kinds on `schedule()`, `nextRunAt` on `getSchedules`, transactional `work()`) that would reduce the adapter to direct calls and drop the `reconcile` requirement. They are worth filing and offering to implement in parallel.
- **Showing the end user the current recurrence, and letting them change it, is a first-class requirement.** The structured definition the user entered is what the library stores in the job payload and returns on read, together with the next fire time. Change is recreation (`reschedule`), which pg-boss makes a single `upsert` statement.
- **Recommendation**: extract the engine now and adopt it in both services; build the facade with the pg-boss adapter as the primary implementation and the BullMQ adapter as a thin compatibility layer; migrate maestro to pg-boss first (it has the most to gain in durability), then CTENG (replacing its tick-based runner with per-occurrence deferred jobs). Do not build a second parallel mechanism inside CTENG: it already has one, and a third design would make convergence harder.

## What exists today

### Maestro: BullMQ job schedulers plus RRULE

Relevant code:

| Concern | Location |
| --- | --- |
| Schedule definition (UI model) | `packages/maestro-common/src/schedule/rruleConfiguration.ts`, `cronExpression.ts` |
| UI model to RRULE string | `src/modules/workflows/utils/rruleUtils.ts` (292 lines, 633 lines of tests) |
| Next occurrence engine | `rruleUtils.ts#getNextOccurrence` plus `rruleRepeatStrategy.ts` (BullMQ `repeatStrategy`) |
| Register / remove schedules | `src/modules/workflows/schedulers/RunWorkflowJobScheduler.ts`, `DetectStuckWorkflowRunsJobScheduler.ts`, `src/modules/tasks/schedulers/TasksAboutToExpireJobScheduler.ts` |
| Fire handler | `src/modules/workflows/repeatable-job-processors/RunWorkflowJob.ts` |
| Metrics | `ScheduleDelayHistogramMetric(V2)`, `ScheduleStrategyCounterMetric`, `ScheduleStartWorkflowRunCounterMetric` |
| Ops tooling | `scripts/cmd/getRunWorkflowJobs.ts` reads BullMQ job schedulers directly |

How it works:

1. Activation translates the trigger step into an RRULE string (or accepts a legacy 5-field cron) and calls `QueueManager.schedule` with `repeat: { pattern, key: workflowId, startDate, immediately }`.
2. BullMQ calls the custom `repeatStrategy` to compute the next fire time. The strategy branches on a cron regex: cron goes through `cron-parser`, everything else through `rrule-rust`.
3. The delayed job fires, `RunWorkflowJob` starts a workflow run, and BullMQ re-registers the next iteration.
4. Pause and cancel call `removeJobScheduler(workflowId)`. Edits compare the stored pattern and remove first, because BullMQ deduplicates on key plus fire time (the long comment in `RunWorkflowJobScheduler.scheduleRecurring` documents a real bug this guards against).

Observations:

- The source of truth for "which workflows are scheduled" is Redis, not Postgres. `docs/cujs/CUJ-002` names the failure mode: if the scheduler entry is missing, the workflow is Live in the database but never fires, and recovery is "re-activate the workflow". There is no reconciliation job.
- Every scheduler class is its own `QueueManager` subclass with its own Redis connections, and `repeatStrategy` has to be injected into both the queue options and the worker options. Three copies of that wiring exist in `WorkflowsModule` and `TasksModule`.
- `getNextOccurrence` contains a one-hour bump to survive DST transitions and throws if that is not enough. It converts between timezones by shifting UTC components, which works but is the kind of code that benefits from a single well-tested home.
- `SCHEDULER_REDIS_*` config is defined in `config.ts` and `.env.default` but nothing consumes it. Dead config, worth removing independently of this work.
- The RRULE approach depends on `rrule-rust`, a native N-API module. That is a real dependency cost for any shared package.

### CTENG: Postgres `next_run_at` plus a periodic runner

Relevant code:

| Concern | Location |
| --- | --- |
| Schedule definition (API model) | `packages/content-type-app-engine-contracts/src/schemas/schedule/scheduleSchemas.ts` |
| Storage | `src/infrastructure/drizzle/schema/schedule.ts` (`frequency`, `days`, `times`, `timezone`, `start_at`, `next_run_at`) and `scheduleExecution.ts` |
| Next occurrence engine | `src/modules/schedule/utils/computeNextRunAt.ts` (Intl-based, no external dependency) |
| Runner | `ScheduleRunnerJobProcessor` (an `AbstractPeriodicJob`, cron tick, single consumer via Redis lock) |
| DST maintenance | `ScheduleNextRunRecomputeJobProcessor` recomputes all `next_run_at` daily at 00:05 UTC |
| Execution tracking | `schedule_execution` table with `QUEUED/RUNNING/COMPLETED/FAILED`, conflict keys, a partial unique index, TTL recovery |
| Docs | `docs/scheduled-jobs-and-filters.md` |

How it works:

1. On save, `ScheduleService` computes `nextRunAt` in UTC from the local time definition and stores it.
2. Every tick, the runner pages through `enabled AND next_run_at <= now()`, advances `next_run_at` **before** dispatching, then dispatches (enqueue import flow, publish export, or call Autopilot).
3. Missed occurrences are collapsed: the runner fires once and advances to the first future occurrence.
4. A daily job recomputes every enabled schedule's `next_run_at` so DST shifts do not drift the local time.

Observations:

- CTENG's recurrence model is deliberately narrow: hourly at one minute past the hour, daily at up to four times, weekly on selected days at those times. No monthly, no sub-hourly, no interval ("every 2 weeks"). Maestro is wider on every axis, though its minutely frequency has a product floor of 15 minutes (`MINUTELY_REPEAT_EVERY_MIN` in `ScheduledTriggerStep.ts`, because scheduled runs bypass the manual-run cooldown), so "every 5 minutes" is not a saveable configuration in either service today. The engine itself should not hard-code that floor; it is a per-product validation rule.
- `times` are exact `{hour, minute}` pairs. An RRULE `BYHOUR=9,18;BYMINUTE=0,30` is a cross product (four times), so a CTENG daily schedule at 09:00 and 18:30 needs either one RRULE per time inside an `RRuleSet`, or an engine that accepts explicit time pairs. This is the main modeling gap between the two services.
- Firing precision is bounded by the runner's cron tick, not by the schedule. Maestro's BullMQ delayed jobs fire at the computed millisecond.
- Postgres is the source of truth. Redis is used only for the single-consumer lock. Losing Redis delays ticks; it does not lose schedules.
- The execution-tracking layer (conflict keys, queued drain, Autopilot correlation) is domain logic and stays in CTENG.

### shared-ts-libs: what background-jobs-common already offers

- `QueueManager.schedule` passes BullMQ `repeat` options through untouched. There is no recurrence logic in the library, and `scheduleBulk` and flows explicitly exclude `repeat`.
- `AbstractPeriodicJob` gives in-process cron or interval jobs with a Redis single-consumer lock. CTENG's runner and recompute jobs are built on it.
- No package in the repo depends on `rrule-rust`, `rrule`, `cron-parser` or `pg-boss`.
- Version skew: maestro is on `background-jobs-common` ^14, CTENG on ^15, the library is at 16.0.0. The new package should not depend on `background-jobs-common` in its core, so neither service needs that major bump to adopt the engine.

## Side-by-side

| Dimension | Maestro | CTENG |
| --- | --- | --- |
| Recurrence model | RRULE (minutely with a 15-minute floor, hourly, daily, weekly, monthly; intervals, weekday sets, hour windows) or legacy raw cron | hourly at one minute, daily / weekly at up to four explicit time pairs, weekday set |
| Engine | `rrule-rust` plus `cron-parser` | hand-written Intl arithmetic |
| Source of truth | Redis (BullMQ job scheduler) | Postgres `schedule.next_run_at` |
| Fire precision | Millisecond, per schedule | Runner tick (cron, per environment) |
| Cluster coordination | BullMQ | Redis mutex around the tick |
| Missed occurrences | BullMQ skips to next | Collapse to one run, advance |
| DST | one-hour bump heuristic | Intl-based, plus daily recompute |
| Change detection | pattern string compare, remove then re-add | overwrite `next_run_at` on save |
| Durability if Redis is lost | schedules gone until re-activation | ticks pause, nothing lost |
| Ops visibility | BullMQ job schedulers, CLI script | SQL, `schedule_execution` rows |
| Tests on the engine | ~850 lines | present, size not measured |

## Target design

### Layer 1: recurrence definition and next-occurrence engine (share)

A `ScheduleDefinition` type that can express both models, and one function:

```ts
nextOccurrence(definition, { after: Date, startAt?: Date }): Date | undefined
```

Inputs to unify: frequency, interval, weekday set, explicit time pairs, hour window (for maestro minutely and hourly), month-day position, IANA timezone, start boundary. Output: a UTC `Date`. Provide serialisation to and from an RRULE string so maestro's stored patterns and BullMQ payloads keep working during the compatibility period.

Why this is the right first cut:

- Pure, synchronous, no I/O. Trivially testable, and the existing maestro test corpus (633 lines in `rruleUtils.spec.ts`, 219 in `rruleRepeatStrategy.spec.ts`) moves with it.
- Both services carry timezone and DST risk here. One implementation with both services' fixtures is stronger than two.
- CTENG can adopt it by making `computeNextRunAt` a thin wrapper, with zero change to storage or runner. That is a safe first consumer.

Open design point: `rrule-rust` versus a pure-JS engine. Maestro has run `rrule-rust` in production, so it is proven. But it is a native binary, and CTENG today has no such dependency. Options, in order of preference:

1. Keep the engine's public API independent of the RRULE library, implement it on `rrule-rust` first, and make the RRULE dependency swappable later if the native build becomes a problem.
2. Port the CTENG Intl-based arithmetic to cover the full model. More work, no native dependency, but re-implements what RRULE libraries already do well (month-end, intervals, week start).

### Layer 2: trigger delivery (share, behind an adapter)

The library does **not** own a durable schedule registry. Both services already keep the user's structured configuration in their own tables (maestro in the workflow layout, CTENG on the `schedule` row), and that remains the canonical record. The delivery adapter's job is to make the next occurrence fire and to answer "when does this fire next". Interface:

```ts
type ScheduledJob = {
  id: string                       // stable per schedule, e.g. workflowId or scheduleId
  definition: ScheduleDefinition   // structured, as the user configured it
  payload: unknown                 // what the service needs at fire time
  nextRunAt: Date | undefined
}

interface DeliveryAdapter {
  schedule(job: ScheduledJob): Promise<void>            // register first occurrence
  reschedule(job: ScheduledJob): Promise<void>          // recreate with a new definition
  unschedule(id: string): Promise<void>
  get(id: string): Promise<ScheduledJob | undefined>
  list(filter: { ids?: string[]; owner?: string }): Promise<ScheduledJob[]>
  onFire(handler: (job: ScheduledJob, firedAt: Date) => Promise<void>): void
}
```

A `Scheduler` facade composes the engine and one adapter and adds `previewOccurrences(definition, { from, count })`, `reconcile(desired: ScheduledJob[])` and a fire-delay metric.

#### pg-boss adapter: the target

pg-boss cannot run a custom recurrence, so the adapter uses a **self-perpetuating chain of deferred jobs** on a dedicated queue with the `short` policy:

1. `schedule(job)` computes the first occurrence with the engine and calls `boss.send(queue, { id, definition, payload }, { startAfter: fireAt, singletonKey: id })`.
2. The worker handler, before doing any domain work, computes the next occurrence from the `definition` carried in the job data and sends the next job with the same `singletonKey`. Then it invokes `onFire`. Under the `short` policy at most one job per key may sit in `created`, while the current one is `active` or in `retry`, so a retried handler cannot double-book.
3. `reschedule(job)` is `boss.upsert(queue, newData, { singletonKey: id, startAfter: newFireAt })`: a single statement that rewrites the pending occurrence in place. This is the recreation path the ask allows.
4. `unschedule(id)` is `findJobs({ key: id, queued: true })` then `cancel`.
5. `get(id)` reads the pending job's `data.definition` and `startAfter`. The definition rides in the payload, so the read requirement is met with no extra table.
6. Sending the next occurrence can share a transaction with the service's own write via `{ db: fromDrizzle(tx, sql) }`, which works for both drizzle drivers in use (postgres-js in maestro, node-postgres in CTENG).

No daily DST recompute is needed: every fire recomputes from the definition in the timezone it carries. Retention is anchored to `start_after`, so month-ahead occurrences are not garbage-collected before firing.

`reconcile(desired)` is part of the first release, not a follow-up. If a handler exhausts retries before it managed to send the next occurrence, the chain dies silently, and the only thing to recover from is the service's domain table. Each service feeds `reconcile` from "Live scheduled workflows" or "enabled schedules" on a periodic job; the library diffs against `findJobs` and sends or cancels as needed. This also closes maestro's CUJ-002 failure mode, which has no equivalent today.

Fixed housekeeping jobs (maestro's `detect_stuck_workflow_runs` and `tasks_about_to_expire`, CTENG's cleanup jobs) do not need the chain: pg-boss's native cron `schedule()` covers them.

#### BullMQ adapter: temporary compatibility

Wraps BullMQ job schedulers exactly as maestro does today, with the engine's `nextOccurrence` supplied as `repeatStrategy`. It exists so maestro can adopt the library and delete its three hand-rolled `QueueManager` subclasses without changing what fires when. Constraints it carries, and why it is not the destination:

- The scheduler record stores only the compiled pattern string, and on the legacy repeat path not even the start date. `get()` must therefore read the pending delayed job and can return only the pattern, not the structured definition. The definition keeps coming from the workflow layout row, which is the status quo.
- The pattern-compare-then-remove logic for edits moves into the adapter so the dedup edge case is handled once.
- Redis remains the firing source of truth; `reconcile` is what makes that tolerable in the interim.
- It is marked deprecated from the first release and removed once maestro is on pg-boss.

### Showing and changing the recurrence for the end user

This is an explicit requirement, covered as follows.

**Today**

- Maestro keeps the structured configuration in the workflow layout's `TriggerStep` settings. The UI reads from there; BullMQ only sees the compiled string. Change goes through `UpdateLiveWorkflowUseCase`: save the layout, compile, compare with the stored scheduler pattern, remove if different, re-add.
- CTENG stores the structured fields on the `schedule` row and returns them through `GET /v1/schedules`. Change is an upsert that recomputes `next_run_at`.

Both services already treat the structured definition as canonical and the runtime artefact as derived. The library preserves that.

**What the library guarantees**

- `ScheduledJob.definition` is the structured `ScheduleDefinition` the caller passed in. On pg-boss it is stored verbatim in the job payload; compiling to a pattern string only happens inside the BullMQ adapter and is never what the read path returns.
- `scheduler.get(id)` returns definition plus `nextRunAt`, so a UI can render "every weekday at 09:00 Europe/Berlin, next run 2026-09-03 07:00 UTC" from one call. On BullMQ the definition part is unavailable and the service reads it from its own row.
- `scheduler.previewOccurrences(definition, { from, count })` runs the engine only, so a form can show the next few runs before saving.
- `scheduler.reschedule(job)` is the change path. On pg-boss it is one `upsert` by `singletonKey`; on BullMQ it is compare, remove, re-add.
- Human-readable rendering (CTENG's `formatScheduleLocalTime`, maestro's form labels) stays in each product because it needs localisation. The library may ship `describe(definition)` for logs and admin tooling.

**Where the definition lives per adapter**

| Adapter | Where `definition` is readable | Notes |
| --- | --- | --- |
| pg-boss | Pending job payload, via `findJobs` by key | Meets the requirement on its own. Products keep their own row for listing and history. |
| BullMQ (compatibility) | Not available; scheduler record holds the pattern only | Service row remains the source. Status quo for maestro, not a regression. |

`list(owner)` on pg-boss is `findJobs({ data: { owner } })`, a top-level key match. It is adequate for admin tooling; customer-facing lists come from the product tables.

### Layer 3: execution tracking and domain dispatch (do not share)

CTENG's `schedule_execution` model (conflict keys, queued drains, Autopilot correlation, TTL recovery) and maestro's `RunWorkflowJob` (start a workflow run, entitlement checks, delay histograms) are domain code. The library exposes `onFire` and `onDispatchFailed` and leaves the rest to the service. Because pg-boss caps `active` time at 24 hours (`expireInSeconds`), the fire handler should enqueue domain work rather than run it inline.

## pg-boss research: what it supports and whether it fits

Checked against pg-boss 12.29.0 (released 2026-08-30), its type definitions, `src/plans.ts`, `src/timekeeper.ts` and the docs at pgboss.io. Requirements: Node 22.12 or newer, PostgreSQL 13 or newer. Runtime dependencies: `pg`, `cron-parser` 5, `serialize-error`. Both services satisfy the Node floor.

**Native cron scheduling (`schedule`)**

| Fact | Source |
| --- | --- |
| `schedule(name, cron, data, options)` stores `(name, key, cron, timezone, data, options)` in a `schedule` table with primary key `(name, key)`. Re-calling updates in place. | `plans.ts`, scheduling docs |
| Cron only, 5-field, minute precision. 6-field (seconds) is discouraged. Parsed by `cron-parser` with `tz`. Unknown timezones are rejected at `schedule()` time. | scheduling docs |
| Due check: `prev()` of the cron relative to database time, due if `prevDiff < 60`. Evaluated every 30 seconds by default (`cronMonitorIntervalSeconds`). | `timekeeper.ts` |
| Cross-instance dedup: the tick sends with `singletonKey: "${name}__${key}", singletonSeconds: 60`. | `timekeeper.ts` |
| Missed slots while no instance was running are skipped, not caught up. | `timekeeper.ts`, scheduling docs |
| Clock skew versus the database is measured every 10 minutes and warned about above 60 seconds. | `timekeeper.ts` |
| There is no hook to supply a custom next-occurrence function. | type definitions |

Verdict: the native scheduler cannot host RRULE, intervals such as "every 2 weeks", or CTENG's explicit time pairs. It is right for fixed housekeeping jobs and nothing else in this design.

**Deferred jobs and dedup (`send`, `startAfter`, `singletonKey`, queue policies)**

| Fact | Source |
| --- | --- |
| `startAfter` accepts a `Date`, an ISO string (with offsets since 12.28.0) or seconds. No documented upper bound on how far ahead. | jobs docs, releases |
| `keep_until = start_after + retentionSeconds` (default 14 days). Retention is anchored to the fire time, not creation. Maintenance deletes `state < 'active' AND keep_until < now()`. | `plans.ts` |
| Queue policies decide what `singletonKey` means. `short`: one job in `created` per key, unlimited active (index `job_i1`, `WHERE state = 'created'`). `exclusive`: one job in `created`, `retry` or `active` per key (`job_i6`). `standard`: no key uniqueness unless `singletonSeconds` is set (`job_i4`). | `plans.ts`, queues docs |
| A `send` rejected by a singleton index resolves `null`; it does not throw. | jobs docs |
| `update(name, data, { singletonKey, startAfter, ... })` and `upsert(...)` modify jobs in `state < 'active'` by `singletonKey`, in one statement. | jobs docs, `plans.ts`, `index.d.ts` |
| `findJobs(name, { key, queued: true })` looks up by `singletonKey` restricted to `created`/`retry`. `getJobById` is deprecated in favour of it. | jobs docs, `types.ts` |
| `cancel` applies to `state < 'completed'`; `deleteJob` removes rows. | `plans.ts` |
| Fire precision is the worker's `pollingIntervalSeconds` (minimum 0.5 s) or LISTEN/NOTIFY wake-up. `useListenNotify` needs a session-pinned connection and does not work through PgBouncer in transaction mode. | `types.ts` |
| `expireInSeconds` (time a job may stay `active`) defaults to 15 minutes, maximum 24 hours. | jobs docs |

Verdict: exactly the primitive set the chain needs. `short` policy with `singletonKey = id` allows the next occurrence to be queued while the current one runs or retries, and refuses a duplicate. `upsert` gives `reschedule` in one statement; `findJobs` gives `get`.

**Transactions**

| Fact | Source |
| --- | --- |
| `send`, `insert`, `fetch`, `complete`, `fail`, `cancel`, `update`, `upsert`, `findJobs` accept `{ db }` where `db` implements `executeSql(text, values)`. | `types.ts` (`ConnectionOptions`) |
| Shipped adapters: `fromDrizzle(tx, sql)` (node-postgres and postgres-js), `fromKnex`, `fromKysely`, `fromPrisma`, `fromPglite`. A rollback of the ORM transaction rolls back the pg-boss statements. | adapters docs, `index.d.ts` |

Verdict: both services can enqueue the next occurrence in the same transaction as their domain write. BullMQ cannot offer this; a Redis write and a Postgres write are never atomic.

**Operations**

| Fact | Source |
| --- | --- |
| `migrate` (default true) runs schema migrations on `start()`. `supervise` (default true) runs maintenance daily, index bloat detection and `REINDEX CONCURRENTLY` (12.29.0), queue monitoring every 60 s. `schedule` (default true) runs the cron timekeeper. Each can be disabled per instance. | constructor docs, releases |
| Schema defaults to `pgboss`, quoted names supported since 12.27.0. Queues can be partitioned into their own tables (`partition: true`). | constructor docs, releases |
| Dead-letter queues with `redrive`, retry with exponential backoff, job dependencies (`flow`), pub/sub. | jobs docs |
| A dashboard package (`@pg-boss/dashboard`) exists for inspection, comparable to bull-board. | repository README |
| Pool size defaults to 10 connections per instance. | constructor docs |

**Fit against the model**

| Operation | pg-boss primitive | Fit |
| --- | --- | --- |
| `schedule(job)` | engine computes first occurrence, `send(queue, data, { startAfter, singletonKey: id })` on a `short` queue | Full |
| Fire and self-perpetuate | `work()` handler: `send` next first, then `onFire`; or `fetch` + `complete` with `db` for a fully transactional step | Full |
| `unschedule(id)` | `findJobs({ key: id, queued: true })` then `cancel` | Full |
| `reschedule(job)` | `upsert(queue, newData, { singletonKey: id, startAfter: newFireAt })` | Full, single statement |
| `get(id)` | `findJobs({ key: id, queued: true })`, read `data.definition` and `startAfter` | Full |
| `list(owner)` | `findJobs({ data: { owner } })` | Adequate for admin tooling |
| `reconcile(desired)` | `findJobs` per id, `send` for missing, `cancel` for stale | Full, library code |
| Missed occurrence while no worker ran | job fires on first fetch after `startAfter`; handler computes next from now | Equivalent to CTENG's "run once, advance" |
| Fixed housekeeping crons | native `schedule()` | Full |

**Does anything need to change upstream first?**

No. Every operation maps to a public, documented pg-boss 12 API, so the chain adapter can ship without waiting on anyone. But the chain is a workaround: the library re-implements, in application code, the "recurring job" concept that pg-boss already has for cron, and pays for it with `singletonKey` discipline, a mandatory `reconcile`, and a `get()` that scrapes job payloads. The next section proposes public API changes that would remove most of that. Two constraints stay regardless: `expireInSeconds` caps handler time at 24 hours (dispatch should enqueue domain work, not run it), and `useListenNotify` is incompatible with PgBouncer transaction pooling (accept polling precision or give pg-boss a direct connection).

## Upstream pg-boss API proposals

Ranked by how much of the chain they remove. Each is grounded in how the current code works, so the cost estimate is realistic. pg-boss is a single-maintainer project that accepts sponsorship and PRs; the realistic path is to file the design as an issue and offer the implementation, while the chain adapter ships in the meantime. The `DeliveryAdapter` interface does not change under any of these; only the adapter's internals shrink.

### Proposal 1: pluggable recurrence kinds on `schedule()` (removes the chain entirely)

**Problem.** `schedule()` accepts only a cron string. The timekeeper evaluates `cron-parser`'s `prev()` against database time every 30 seconds and sends when `prevDiff < 60`, deduplicating across instances with `singletonSeconds: 60`. There is no place to plug in another expression language, and pg-boss should not take on RRULE dependencies (the good ones are native or heavy).

**Proposal.** Make the expression kind explicit and let the process register parsers, the same way it registers `work()` handlers:

```ts
const boss = new PgBoss({
  connectionString,
  recurrences: {
    rrule: {
      // pure function; pg-boss never stores or serialises it
      next: (expression: string, after: Date, tz: string) => Date | null,
      validate: (expression: string, tz: string) => void,   // throw to reject at schedule() time
    },
  },
})

await boss.schedule('run-workflow',
  { kind: 'rrule', expression: 'DTSTART;TZID=Europe/Berlin:20260901T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { workflowId, groupId },
  { key: workflowId, missed: 'once' },
)
```

A plain string stays `{ kind: 'cron' }` for backward compatibility, and `cron` is the one built-in kind (already implemented on `cron-parser`).

**Storage change.** Add `kind text NOT NULL DEFAULT 'cron'`, `next_run_at timestamptz` and `last_run_at timestamptz` to the `schedule` table. `schedule()` computes `next_run_at` with the registered parser at insert time. The timekeeper replaces "does `prev()` fall within the last 60 seconds" with:

```sql
UPDATE pgboss.schedule
SET last_run_at = next_run_at, next_run_at = NULL
WHERE next_run_at <= now()
RETURNING *
FOR UPDATE SKIP LOCKED
```

then, per row, `send(name, data, { ...options, singletonKey: key })` and `UPDATE ... SET next_run_at = <parser.next(expression, last_run_at, tz)>`. Cross-instance dedup comes from row locking instead of `singletonSeconds: 60`, which also lifts the minute granularity for kinds that want it. Instances without a parser for a stored kind skip those rows and emit a warning, mirroring how a queue with no `work()` handler simply is not fetched.

**`missed` policy.** With `next_run_at` persisted, the timekeeper knows exactly which occurrences were skipped while no instance ran. Expose it: `missed: 'skip' | 'once' | 'all'`, default `skip` to preserve today's behaviour. Our services want `once`.

**What it removes on our side.** The self-perpetuating chain, the `short` policy and `singletonKey` bookkeeping, `reconcile` for the pg-boss backend (the schedule row is the registry), and payload scraping for `get()`. The adapter becomes a direct mapping: `schedule` and `reschedule` call `boss.schedule` (already an upsert on `(name, key)`), `unschedule` calls `boss.unschedule(name, key)`, `get` calls `boss.getSchedules(name, key)`. Still ours: the recurrence engine (registered as the `rrule` parser) and `previewOccurrences`.

**Cost upstream.** One migration, roughly 80 lines in `timekeeper.ts`, types for the registration option, docs. No new dependency. The main design conversation is whether the maintainer accepts parsers-as-process-config; the precedent is that `work()` handlers are exactly that.

### Proposal 2: richer `getSchedules` and a `getSchedule(name, key)`

**Problem.** `getSchedules()` returns the stored row only: `name, key, cron, timezone, data, options`. Nothing tells you when it fires next or when it last fired, so a UI or a health check has to compute it or scrape jobs.

**Proposal.** Return `nextRunAt`, `lastRunAt`, `lastJobId` and `kind` on each schedule (all available once Proposal 1 lands; `nextRunAt` for cron is computable today), add `getSchedule(name, key)` returning one row or null, and add `previewSchedule(kind, expression, tz, { from, count })` that runs the registered parser without persisting anything.

**What it removes on our side.** `previewOccurrences` becomes a passthrough, `get()` becomes one call with no payload parsing, and "next run" in either product's UI is a straight read.

### Proposal 3: `repeat` option on `send()` with atomic next-occurrence insertion

An alternative to Proposal 1 for maintainers who would rather not touch the timekeeper. It keeps the chain but moves it inside pg-boss where it can be atomic:

```ts
await boss.send('run-workflow', data, {
  singletonKey: workflowId,
  repeat: { kind: 'rrule', expression, tz, missed: 'once' },
})
```

When a job carrying `repeat` is fetched, pg-boss computes the next occurrence with the registered parser and inserts the successor in the same transaction as the fetch (or as `complete`, configurable). Successors inherit `repeat` and `singletonKey`. Cancelling the pending successor stops the series. This is what our adapter does by hand today, minus the race window between fetch and the handler's `send`, and minus the need for `reconcile`.

Compared with Proposal 1 it gives no registry (`getSchedules` does not see these), so `get()` still scrapes the pending job. It is the weaker option, but it is a smaller change and fits pg-boss's existing "everything is a job" model. If the maintainer prefers this shape, it is still a large DX gain over the hand-rolled chain.

### Proposal 4: `work()` with a transactional handler

**Problem.** Today the only way to run fetch, handler side effects and `complete` in one transaction is to bypass `work()` and call `fetch` and `complete` yourself with `{ db }`. `work()` is where polling, batching, heartbeats and error handling live, so bypassing it means re-implementing those.

**Proposal.**

```ts
await boss.work('run-workflow', { transactional: true }, async (job, tx) => {
  // tx implements IDatabase; the fetch that claimed `job` ran in it, and complete/fail will too
  await scheduler.sendNextOccurrence(job, { db: tx })   // if still on the chain
  await runs.insert(job.data, { db: tx })
})
```

Rollback on throw returns the job to `retry` with nothing half-written. This benefits the chain adapter immediately (the send-next-then-dispatch sequence becomes atomic) and stays useful after Proposal 1 for the domain write.

### Proposal 5: `findJobs` filters and a `getJobByKey`

**Problem.** `findJobs` filters by `id`, `key`, top-level `data` match and `queued`. There is no `states`, `limit`, ordering or cursor, so on a busy key it returns history, and `list(owner)` over many schedules is unbounded.

**Proposal.** Add `states?: JobState[]`, `limit?: number`, `orderBy?: 'createdOn' | 'startAfter'`, `after?: cursor`, and a convenience `getJobByKey(name, key)` returning the single pending job or null. Small change to one query in `plans.ts`.

### Proposal 6: documentation fixes

- State that `keep_until` is anchored to `start_after`, so deferrals longer than `retentionSeconds` are safe. Today this is only visible in `plans.ts`.
- State per queue policy which job states the `singletonKey` uniqueness index covers (`short`: `created`; `exclusive`: up to `active`; `standard`: none without `singletonSeconds`). Today you read the index definitions to learn this.
- Document `missed`-slot behaviour of the cron scheduler explicitly (currently: skipped).

### How this changes the plan

- Ship the chain adapter now against 12.x; it needs nothing upstream.
- File Proposal 1 with Proposal 2 as one design issue, with an offer to implement. File Proposals 4, 5 and 6 as independent small PRs; they are uncontroversial and each improves the chain adapter on its own.
- Design the pg-boss adapter so that "native recurrence" is an internal strategy switched on by a capability check (`boss.schedule` accepting an object), not a second adapter. Consumers never see the difference.
- If Proposal 1 is declined, Proposal 3 is the fallback to push for; if both are declined, the chain stays and Proposals 4 and 5 make it safe and cheap enough to live with.

## Extract versus a parallel mechanism in CTENG

The question as posed assumes CTENG has nothing. It does, so the real alternatives are:

| Option | Description | Verdict |
| --- | --- | --- |
| A. Status quo | Two independent designs, no shared code | Cheapest now. Two DST implementations, two sets of edge cases, no durable path for maestro. |
| B. Copy maestro's BullMQ scheduler into CTENG | Add a BullMQ job-scheduler path next to the Postgres runner | Worst option. CTENG would gain a less durable second mechanism, a native dependency, and Redis as a source of truth for something it already keeps in Postgres. |
| C. Extract recurrence engine only | New pure package, both services adopt | Low risk, clear value, no infrastructure change. Happens regardless. |
| D. Extract engine plus delivery facade, pg-boss target, BullMQ compatibility | C, then maestro on BullMQ adapter, then maestro on pg-boss, then CTENG on pg-boss | Medium effort. Gives maestro durability and transactional enqueue, gives CTENG per-occurrence precision and the richer recurrence model, and ends with one mechanism in both services. |

Recommendation: **C immediately, D incrementally**, in the order below.

## Proposed package

`@lokalise/scheduling-common` under `packages/app/`, with entry points so consumers only pull what they use:

- `@lokalise/scheduling-common` (core): `ScheduleDefinition` zod schema, `nextOccurrence`, RRULE serialisation, `DeliveryAdapter` interface, `Scheduler` facade with `previewOccurrences` and `reconcile`, fire-delay metric helper.
- `@lokalise/scheduling-common/pg-boss`: chain adapter, queue setup (`short` policy), worker registration, transactional send helper. `pg-boss` as an optional peer dependency.
- `@lokalise/scheduling-common/bullmq`: job-scheduler adapter, marked deprecated. `bullmq` as an optional peer dependency.

Dependencies of core: `zod`, the RRULE engine (initially `rrule-rust`), `cron-parser` for legacy cron patterns. No dependency on `background-jobs-common`, `ioredis`, `bullmq` or `pg-boss` in core. Tests for the pg-boss entry point need a Postgres container in the package's docker-compose, mirroring how `background-jobs-common` runs Redis.

## Migration outline

1. **Engine package.** Move `rruleUtils.ts`, `rruleRepeatStrategy.ts` (minus the metric coupling) and `RRULE_CONFIGURATION_SCHEMA` into the new package. Extend the model with explicit time pairs and CTENG's weekday numbering. Port both services' test fixtures. Maestro adopts by import swap; `maestro-common` re-exports the schema for the frontend contract.
2. **CTENG adopts the engine.** `computeNextRunAt` delegates to `nextOccurrence`. Storage and runner unchanged. Run both implementations side by side in tests over a year of dates in the timezones CTENG customers use, then delete the local implementation.
3. **Facade, pg-boss adapter, BullMQ adapter.** Build the pg-boss adapter first with the full test suite (chain, `upsert` reschedule, retention, transactional send, reconcile), structured so a native-recurrence strategy can replace the chain internally later. Build the BullMQ adapter as a thin wrapper carrying maestro's pattern-compare-then-remove logic. In parallel, file the upstream pg-boss proposals and offer the implementation.
4. **Maestro on the BullMQ adapter.** Replace `RunWorkflowJobScheduler`, `DetectStuckWorkflowRunsJobScheduler` and `TasksAboutToExpireJobScheduler` with facade calls. Add the periodic `reconcile` fed from Live scheduled workflows. The CLI script switches to `scheduler.list()`. No runtime behaviour change; CUJ-002's missing-scheduler failure mode gains a recovery path.
5. **Maestro on pg-boss.** Add pg-boss to maestro (schema in the service database, worker in the same process as today's BullMQ worker). Cut over per workflow: on next activation or edit, register on pg-boss and unregister from BullMQ; run `reconcile` to migrate the remainder in a controlled batch. Housekeeping schedulers move to native pg-boss cron. Remove the BullMQ adapter dependency and the dead `SCHEDULER_REDIS_*` config.
6. **CTENG on pg-boss.** Replace `ScheduleRunnerJobProcessor` and `ScheduleNextRunRecomputeJobProcessor` with the facade: on save, `schedule` or `reschedule`; the `onFire` handler runs today's `executeScheduleInTransaction` logic and `schedule_execution` tracking unchanged. `next_run_at` becomes a cached display value populated from `get()`, or is dropped. Fire precision improves from tick granularity to per-occurrence.
7. **Retire the BullMQ adapter** once no consumer depends on it.

## Risks and things to settle early

- **Model unification.** Explicit `times` pairs versus RRULE `BYHOUR`/`BYMINUTE` cross products. Decide whether the library model is "RRULE plus an `RRuleSet` per time pair" or a native model that renders to RRULE only for BullMQ payloads. The second is cleaner once BullMQ is gone; the first is cheaper for maestro now.
- **Native dependency.** `rrule-rust` in a shared package puts a native build on every consumer's CI and Docker image. Maestro already pays this; CTENG would start to. Keep the engine API library-agnostic so this can be revisited.
- **Behavioural drift during migration.** Maestro's DST one-hour bump and CTENG's Intl resolution can disagree at transition instants. The side-by-side test in step 2 is the guard.
- **pg-boss is new infrastructure in both services.** A `pgboss` schema in each service database, automatic migrations on `start()` (pin the version and disable `migrate` on all but one instance during upgrades), a `pg` pool alongside the existing driver, and poll-interval fire precision. Runbooks change: CUJ-002's recovery steps for maestro become "check pending jobs in `pgboss`, run reconcile".
- **Chain breakage is silent without reconcile.** `reconcile` ships in the first release and both services run it periodically. Alert on schedules present in the domain table with no pending job.
- **Read path on the BullMQ adapter.** During step 4, `get()` returns only the compiled pattern and next fire time; the structured definition still comes from the workflow layout row. That is the status quo, not a regression, and it ends at step 5.
- **Missed-occurrence policy.** CTENG collapses missed fires; BullMQ effectively does too; the pg-boss chain fires the overdue job once and computes the next from now. Make it an explicit option (`catchUp: 'skip' | 'once' | 'all'`) rather than an accident of the backend.
- **Ownership.** A shared scheduler touches revenue-critical paths in two teams' services. Agree on a code owner in `shared-ts-libs` before step 3.
