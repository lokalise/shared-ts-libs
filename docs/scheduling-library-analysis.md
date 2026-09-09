# Extracting scheduling from maestro into a shared library

Analysis date: 2026-09-09. Repositories inspected: `maestro`, `content-type-app-engine` (CTENG), `shared-ts-libs`. pg-boss facts checked against 12.30.0, which is released and cron-only, and against [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898), the RRULE change open for 12.31.0 that this design assumes.

## Summary

- **CTENG already has a scheduling mechanism in production.** It stores schedules in Postgres with a `next_run_at` column, and a single-consumer periodic job ticks on a cron and dispatches whatever is due. Maestro uses BullMQ job schedulers with a custom RRULE repeat strategy. The two designs differ at every layer: recurrence model, next-occurrence engine, storage, trigger delivery, and execution tracking.
- **The layer worth sharing first is the recurrence engine**: a schedule definition plus "next occurrence after T in timezone Z". It is pure logic with no infrastructure dependency, and it is where both services carry the hardest code (DST, timezone conversion, start boundaries) and the most tests.
- **The engine underneath it is `rrule-temporal`, because that is the one pg-boss uses.** From 12.31.0 pg-boss evaluates rule schedules itself, so any other choice puts two RFC 5545 implementations in the same system, agreeing on the ordinary cases and parting ways at DST edges and on how strictly a malformed rule is judged. A preview that disagrees with the fire time is a support ticket nobody can reproduce. It is also pure JS with one types-only dependency and no polyfill to install, which retires the native-module cost `rrule-rust` carries into every consumer's image. Pin it to the range pg-boss pins.
- **The definition is RFC 5545 rather than a model of our own.** Both products' capabilities were read off the code and mapped part by part: everything maestro and CTENG express needs six of RRULE's fourteen rule parts (`FREQ`, `INTERVAL`, `BYDAY`, `BYHOUR`, `BYMINUTE`, `BYMONTHDAY`), and none of the hard ones. So RRULE is the lingua franca, narrowed by a published profile, with a codec in core: the forward half already exists in maestro (~90 lines) and needs about 50 more for CTENG's `times[]` and weekday numbering, and the reverse half is one bounded decision tree (~150 lines) guaranteed by a `decode(encode(form))` property test. Each product keeps its own form schema as its API contract; what changes is only what the library stores and computes on.
- **A single rule is the unit, and CTENG's 1-to-4 times per day are that many rules.** `BYHOUR=9,17;BYMINUTE=15,45` is the cross product of four times, so two arbitrary times of day cannot share one `RRULE`, and pg-boss rejects an expression carrying a second one. A form therefore encodes to a list of one to four canonical rules, the facade registers one backend schedule per rule under a derived key, and `nextOccurrence` over the list is the earliest of the per-rule answers. Grouping the list back into one logical schedule on read is the facade's job, and it is the one place where a product form is not one backend row.
- **Trigger delivery goes behind one adapter interface, with pg-boss and BullMQ as equally supported implementations.** This document does not pick a winner between them, and neither does the library: which backend a service runs is a service-level choice until there is a broader org architectural decision on which paths are supported and officially recommended. What the analysis records as input to that decision is the durability difference. Redis persistence is best-effort (an RDB snapshot loses everything since the last dump, AOF with `everysec` still loses up to a second, and a failover to a replica can lose acknowledged writes), while Postgres commits are synchronously durable and covered by the same backup, point-in-time recovery and replication guarantees as the rest of the service's data, and pg-boss can register or cancel a schedule in the same transaction as the service's own write. Against that, BullMQ fires with lower latency, is already in production in maestro, and is the queue `background-jobs-common` supports today, so a service on BullMQ adds no infrastructure to adopt the library. Neither adapter owns a schedule table: the service's domain table stays the canonical registry, and the pending job or job scheduler is the runtime record.
- **pg-boss's `schedule()` is cron-only in 12.30.0, and the fix is open for 12.31.0.** [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898) makes RRULE a built-in expression format rather than a plugin point: a rule goes in the same string argument a cron expression goes in, `schedule()` decides which format it is and records the answer in a new `kind` column, and occurrences come from `rrule-temporal`. It also adds `getSchedule(name, key)`, a synchronous `previewSchedule(expression, { tz, from, count })` and `lastJobId`. The adapter is then a direct mapping onto `boss.schedule`, `boss.unschedule`, `boss.getSchedule` and `previewSchedule`, with the schedule row as the runtime registry. If the adapter is due before that release, it ships the same public surface over a self-perpetuating chain of deferred jobs and switches internally later: no caller change and no migration of running schedules, given three rules held from the first commit (no backend identifier crosses the facade, the option surface is one both strategies honour, one mechanism per key). Existing series convert on their next fire, write or reconcile. The plan therefore builds the pg-boss adapter last, when the release state is known.
- **Two things #898 deliberately leaves out shape the library's own scope.** There is no persisted `next_run_at`, so "when does this fire next" is computed on read from the stored expression rather than looked up, and there is no missed-occurrence policy, so an occurrence that falls while no instance is running the timekeeper is dropped. Both products fire a missed occurrence late today rather than dropping it, so catch-up is the facade's job in the first release, driven by the reconcile pass against a last-fired time the service already records, and it becomes a backend option when the upstream `missed` follow-up lands.
- **Showing the end user the current recurrence, and letting them change it, is a first-class requirement.** The canonical rules the user's form encoded to are what the library stores on the backend (a schedule row, a job payload or scheduler template data) and hands back on read, together with the next fire time, and `decode` turns them into that product's form again. The next fire time is computed from the stored rule rather than read from a column, since pg-boss stores no next-occurrence column and its `previewSchedule()` is the same arithmetic its own pass runs. Change is recreation (`reschedule`), which pg-boss makes an upsert per rule.
- **Recommendation**: extract the engine now and adopt it in both services; build the facade with both adapters behind one conformance suite, so that adopting the library never forces a backend change; let each service keep or choose its backend on its own constraints (maestro is already on BullMQ and stays there with no runtime change, CTENG is Postgres-only today and would add Redis to use the BullMQ adapter). Any move of a service from one backend to the other is a separate decision, waiting on the org-level call, and the library is what makes it a config change rather than a rewrite. Do not build a second parallel mechanism inside CTENG: it already has one, and a third design would make convergence harder.

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

- The source of truth for "which workflows are scheduled" is Redis, not Postgres. Maestro's own critical-user-journey document for this path, `docs/cujs/CUJ-002-scheduled-workflow-triggering.md` in the maestro repository (referred to below as CUJ-002), records the failure mode and its business impact: if the scheduler entry is missing, the workflow is Live in the database but never fires, no user-facing error is raised, and "revenue-generating automated workflows do not run" until someone notices the output is missing. Stated recovery is "re-activate the workflow". There is no reconciliation job.
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
- `times` are exact `{hour, minute}` pairs. An RRULE `BYHOUR=9,18;BYMINUTE=0,30` is a cross product (four times), so a CTENG daily schedule at 09:00 and 18:30 needs one RRULE per time, and since neither pg-boss nor the engine takes a set of rules, one backend schedule per time. This is the main modeling gap between the two services, and the reason a recurrence is a list rather than a string.
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

A `ScheduleDefinition` that is canonical RFC 5545 text for exactly one rule (`DTSTART;TZID` and one `RRULE`, in a fixed part order), a `Recurrence` of one to four of those, one codec per product form, and one function:

```ts
type ScheduleDefinition = string & { readonly brand: unique symbol }
type Recurrence = readonly [ScheduleDefinition, ...ScheduleDefinition[]]   // 1 to 4

nextOccurrence(recurrence: Recurrence, { after: Date }): Date | undefined

// bound to one product's form schema
codec<Form>(schema: ZodType<Form>): {
  encode(form: Form): Recurrence                    // total, canonical
  decode(recurrence: Recurrence): Form | 'custom'
}
```

One rule per definition, because that is what both ends accept: pg-boss rejects an expression carrying a second `RRULE`, and `rrule-temporal` builds one rule per instance and has no set type. So a recurrence set is a list in our code and a backend schedule per element on the wire, and `nextOccurrence` is the earliest of the per-rule answers. The list is ordered by first occurrence so the derived backend keys are stable across an encode.

The canonical text is the only representation that gets stored, transported or read back. Nothing re-encodes it: adapters pass each string through, `nextOccurrence` parses it, and the parsed rule lives inside the engine as a cache artefact. `encode` is the only thing that mints a `ScheduleDefinition`, and because a codec is bound to one form schema (maestro's `RRULE_CONFIGURATION_SCHEMA`, CTENG's `frequency`/`days`/`times`), `decode` cannot hand a caller the other product's shape.

What the codec has to cover: frequency, interval, weekday set, explicit time pairs, hour window (for maestro minutely and hourly), month-day position, IANA timezone, start boundary. All of it maps onto six RRULE parts plus `DTSTART`, worked through in "Engine and model: trade-offs" below. Output of `nextOccurrence` is a UTC `Date`.

The start boundary is `DTSTART` and nothing else. It cannot be a separate argument alongside the expression, because pg-boss has nowhere to put one: the schedule row holds an expression and a time zone, so a start that is not inside the text does not survive a write. That is a constraint worth having, since `DTSTART` is also what fixes the phase of every `INTERVAL` and the time of day of any component no `BYxxx` part pins. An expression with no `DTSTART` is anchored on 1970-01-01T00:00:00 in the schedule's zone, which is deterministic across instances and releases but is rarely the phase a caller meant, so `encode` always emits one.

Why this is the right first cut:

- Pure, synchronous, no I/O. Trivially testable, and the existing maestro test corpus (633 lines in `rruleUtils.spec.ts`, 219 in `rruleRepeatStrategy.spec.ts`) moves with it.
- Both services carry timezone and DST risk here. One implementation with both services' fixtures is stronger than two.
- CTENG can adopt it by making `computeNextRunAt` a thin wrapper, with zero change to storage or runner. That is a safe first consumer.

Two design decisions sit inside this layer and deserve a full treatment: which library computes occurrences, and what the canonical definition model is. They are related but separable, and the section "Engine and model: trade-offs" below works through both.

#### Engine and model: trade-offs

**Decision 1: what computes the next occurrence**

One criterion outranks the rest now that [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898) evaluates rules itself: on the pg-boss adapter, whatever engine the library uses is the *second* engine to read the same text, since pg-boss decides when a job actually fires. Two implementations of RFC 5545 agree on the ordinary cases and part ways exactly where this document already says the risk lives, at DST edges and on how strictly a malformed rule is judged, and a preview that disagrees with the fire time is a support ticket nobody can reproduce. Using the engine pg-boss uses removes that class of bug rather than testing for it.

Candidates, with the facts that matter:

| Candidate | What it is | Timezone and DST handling | Dependency footprint | Production evidence here |
| --- | --- | --- | --- | --- |
| `rrule-rust` 3.1.1 | N-API binding to the Rust `rrule` crate. Full RFC 5545 recurrence: `RRuleSet`, `EXRULE`, `RDATE`, `EXDATE`, `WKST`, `BYSETPOS`, month-end (`BYMONTHDAY=-1`). | Native `DTSTART;TZID=` support, computed in Rust with the crate's own tz database. Maestro still wraps it with a UTC shift and a one-hour DST bump in `getNextOccurrence`, which suggests the wrapping code, not the library, is where the doubt lives. | Prebuilt binaries as optional platform packages (14 targets, including `linux-x64-musl`, `linux-arm64-gnu`, `wasm32-wasi` as a fallback). No compile step on install. Maestro's Dockerfile has no special handling and runs it in production. Adds ~14 lockfile entries and a binary per image. | Maestro, all scheduled workflows, since the RRULE migration. |
| `rrule` 2.8.1 (pure JS) | The long-standing JS port of python-dateutil's rrule. `tslib` only. | Weak by design: computes in "floating" time and expects the caller to convert. `TZID` support has been partial and bug-prone across versions; DST transition results depend on the host timezone unless carefully wrapped. This is the reason maestro chose `rrule-rust` in the first place. | Zero native code. | None. |
| `rrule-temporal` 2.2.4 (pure JS) | RRULE on top of the `Temporal` API. Correct zoned arithmetic falls out of `Temporal.ZonedDateTime`. One rule per instance, no set type, and a `strict` mode that rejects the combinations RFC 5545 forbids outright. | Strong: DST and calendar math are Temporal's job. | Pure JS, one dependency, and that one (`temporal-spec`) is types only. Needs no polyfill installed: the dist bundles fullcalendar's `temporal-polyfill` (~164 KB unminified) behind `globalThis.Temporal ?? bundled`, so it uses the runtime's own Temporal once there is one. Node 22+. Young project, small user base. | pg-boss 12.31.0 evaluates every rule schedule with it, pinned `~2.2.4`. |
| Own Intl-based arithmetic (CTENG's `computeNextRunAt`, extended) | Hand-written candidate enumeration using `Intl.DateTimeFormat` to resolve local wall time to UTC, including the spring-forward gap rule. | Correct for what it covers, and CTENG runs it in production. Correctness for new features (monthly `last`, `INTERVAL` across weeks, `WKST`) has to be built and tested by us. | Zero dependencies. | CTENG, all schedules. |

Trade-offs, beyond the table:

- **Correctness risk concentrates in DST edges and calendar arithmetic**, and both are solved problems in mature RRULE implementations. Writing them again is the highest-risk option even though it looks like the cleanest. CTENG's implementation is roughly 300 lines for three frequencies with no intervals; maestro's model adds minutely windows, hourly windows, `repeatEvery`, and month-day positions. Covering that in hand-written code and proving it over DST transitions in every customer timezone is a real project, not a port.
- **The native binary cost is real but already paid once.** Every consumer's CI and Docker image gains a platform binary and the lockfile gains the platform matrix. The failure modes are known (a missing target, a musl/glibc mismatch, a pnpm `supportedArchitectures` misconfiguration) and they fail loudly at install time, not at 3 a.m. CTENG on `linux-x64` is a covered target. The `wasm32-wasi` fallback also covers unexpected targets at a performance cost.
- **Every backend wants a string, so the engine needs a parser either way.** BullMQ's `repeatStrategy` receives `opts.pattern` and parses it on every fire; the pg-boss chain carries the rule in the job payload; on pg-boss native the expression is the schedule row's own column. A hand-written engine would mean writing an RFC 5545 parser as well, or smuggling JSON through fields that other tooling reads as a recurrence.
- **On pg-boss native, the engine's dependency footprint is paid twice or once.** pg-boss carries `rrule-temporal` from 12.31.0 whether we use it or not, so a service on that adapter installs it regardless. Choosing it in core adds nothing to that service's install; choosing `rrule-rust` adds a native module and a platform matrix on top of a pure-JS engine already in the tree.
- **Lock-in is controllable.** The public API is a definition in and a `Date` out, and the definition is RFC 5545 text rather than anything of our own, so the engine behind it can be swapped without touching consumers or stored rules. The tests are the asset: build the fixture corpus (both services' existing tests, plus a generated sweep of a year of occurrences per timezone) so that a swap is a green-suite exercise.

Recommendation for decision 1: **`rrule-temporal` behind a library-agnostic API**, pinned to the range pg-boss pins so the library and the backend cannot drift onto two versions of the same engine, with the fixture corpus as the swap guarantee.

What this buys beyond one fewer dependency: `previewSchedule()` is pure and needs no database or started instance, so the fixture corpus can be run through pg-boss's own validator and its own occurrence walk in a unit test. Every rule `encode` mints is then provably storable and provably fires when the library says it will, which is a stronger guarantee than any amount of agreement testing between two engines.

The costs, stated plainly. `rrule-temporal` is young and thinly used outside pg-boss, and pg-boss pinning it to a patch range is a sign its maintainer reads it the same way. It has no set type, which is part of why a recurrence is a list of rules here. Maestro gives up `rrule-rust`, which has more mileage in our own production than the replacement does, so step 1's side-by-side run is over the two RRULE engines rather than a formality, and it is what has to be green before maestro switches. Against that, maestro's image loses a native module and 14 platform packages.

**Decision 2: what the canonical definition model is**

The two services describe schedules differently, and the choice is whether the library's `ScheduleDefinition` is RRULE-shaped or product-shaped. Inventing a model is the more expensive default than it looks, so the first question is whether RFC 5545 actually covers both products. It does.

**The subset both products need**

Read off maestro's compiler (`rruleUtils.ts#translateFilters`) and CTENG's schema and engine (`scheduleSchemas.ts`, `computeNextRunAt.ts`):

| RRULE part | Maestro uses | CTENG needs | In the profile |
| --- | --- | --- | --- |
| `FREQ` | `MINUTELY`, `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY` | `HOURLY`, `DAILY`, `WEEKLY` | those five |
| `INTERVAL` | minutely, hourly, weekly, monthly (`repeatEvery`) | not used | yes, integer >= 1 |
| `BYDAY` | weekly selection, and a filter on the minutely and hourly windows | `days: 1..7` (Mon to Sun, ISO order) | yes, weekday set, no ordinal prefixes |
| `BYHOUR` | one hour (daily, weekly, monthly) or a contiguous range (windows) | implied by `times[]` | yes, list of hours |
| `BYMINUTE` | one minute; never combined with `FREQ=MINUTELY` | the hourly minute, and each entry of `times[]` | yes, list of minutes, forbidden with `FREQ=MINUTELY` |
| `BYMONTHDAY` | `1`, `-1`, or the start date's day-of-month | not used | yes, single value, 1 to 28 or -1 |
| Rules per recurrence | one | up to four, one per distinct time | 1 to 4, each its own backend schedule |
| `DTSTART;TZID` | always, IANA zone | `startAt` plus `timezone` | required, and the only channel for a start boundary |
| `WKST` | fixed `MO` | not applicable | fixed `MO` |
| `COUNT`, `UNTIL` | not in stored rules (`UNTIL` only inside the next-occurrence call) | not used | excluded for now, and cheap to add: pg-boss honours both, rejects a rule with nothing left to send, and `COUNT` needs the `DTSTART` the encoder already emits |
| `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, `BYMONTH`, `EXRULE` | not used | not used | excluded |
| `RDATE`, `EXDATE` | not used | not used | excluded, and worth remembering: pg-boss accepts both, so "run this once extra" and "skip the December holiday" have a home when a product asks for them |

Six of RFC 5545's fourteen rule parts, and none of the awkward ones: no `BYSETPOS`, no ordinal `BYDAY` ("second Tuesday"), no week-number arithmetic. Everything CTENG expresses today, including its 1-to-4 `times[]` and its `startAt` boundary, lands inside the profile, and so does everything maestro expresses. RFC 5545 is a superset of both, with room for what either product will plausibly ask for next: last weekday of the month, "every second Friday", an end date.

Two places where the mapping is not literal:

- **Multiple times of day need one rule each, and that means one backend schedule each.** `times: [09:15, 17:45]` cannot be one `RRULE`, because `BYHOUR=9,17;BYMINUTE=15,45` is the cross product of four times. RFC 5545 says `RRULE` SHOULD NOT appear more than once in a component, and both ends here take that as a hard rule: pg-boss rejects a second `RRULE` outright, and `rrule-temporal` builds one rule per instance with no set type. So a recurrence is a list of one to four rules, and the facade registers each under its own derived key (`${id}#0`, `${id}#1`), grouping them back on read. What it costs is listed under "Fanning a recurrence out to one schedule per rule" below; what it buys is that the string the library stores is the string pg-boss accepts, with no set-flattening step at the boundary and no interop wart.
- **CTENG's hourly minute is a local minute.** `FREQ=HOURLY;BYMINUTE=M` with a `TZID` carries the same semantics, including in zones with 30 or 45 minute offsets, which its `computeNextHourlyRunAt` searches for by hand today.

**How easy is the translator?**

Forward, product form to RRULE, is already written and small. Maestro's `translateFilters` is roughly 90 lines of branches and emits five of the six parts for all five frequencies. CTENG adds two things: `times[]` to one rule per time, and its `days: 1..7` to `BYDAY` through a seven-entry map (its numbering is ISO, so it lines up with `MO` to `SU` in order). Call it under 50 lines on top of what exists, plus fixtures. It is a total function: every in-profile form has exactly one encoding.

Backward, RRULE to product form, is the new work and the half that the UI requirement actually depends on. It is tractable for the same reason the forward direction is: the profile is small and closed. Read `FREQ`, `INTERVAL`, `BYDAY`, `BYHOUR`, `BYMINUTE`, `BYMONTHDAY`; group sibling rules by `(FREQ, INTERVAL, BYDAY)` to recover `times[]`; return the form. Anything outside the profile decodes to `custom`, which the UI renders read-only and each product's write path rejects, which is how calendar UIs have always handled rules their form cannot express. Estimate 100 to 150 lines, and the guarantee is a property test over the fixture corpus: `decode(encode(form))` is the identity for every fixture, and `encode` is canonical (fixed part order, sorted `BYDAY`, `BYHOUR`, `BYMINUTE`) so equality is a string compare again.

Three traps the profile has to encode, two of them found in the existing code:

- **`BYMINUTE` filters rather than expands under `FREQ=MINUTELY`**, which is what maestro's `MINUTELY_END_OF_DAY_TIME` comment is about: a half-hour window boundary can produce a rule that never fires. The profile forbids that combination and expresses windows as `BYHOUR` plus `INTERVAL` on whole-hour boundaries, keeping the 23:59 sentinel handling in the encoder.
- **`monthDayPosition: 'current'` currently compiles to `byMonthday: [new Date().getUTCDate()]`**, the day the compile happens to run on. Recompiling on a different date silently moves the schedule, and 29 to 31 skip short months. Making the encoding canonical forces this into the open: take the day from `DTSTART` and constrain it to 1 to 28 or `-1`. Rules that already store 29 to 31 are left alone rather than rewritten: `decode` still reads them, the profile validator marks them out of profile so the form renders read-only, and a one-off audit lists the affected workflows for their owners to re-pick between a fixed day and `-1`. Normalising them silently is the one thing to avoid, because "the 31st" and "month end" are different intents and the compile date does not record which was meant. February in a leap and a non-leap year is a fixture, for 29, 30, 31 and `-1`. Worth fixing in maestro independently of this work.

- **A sub-daily `INTERVAL` counts elapsed time, not clock time.** `FREQ=HOURLY;INTERVAL=6` is anchored on a `DTSTART` in standard time, so in a zone that observes daylight saving its occurrences move an hour with the offset: midnight, 06:00, 12:00 and 18:00 in January become 01:00, 07:00, 13:00 and 19:00 in July. `FREQ=DAILY;BYHOUR=0,6,12,18` holds across the transition, as `0 */6 * * *` does. Maestro's `repeatEvery` on an hourly frequency compiles to the first shape today, so the profile requires the hours to be named whenever a form means "at these times of day", and the encoder emits `BYHOUR` rather than an interval for exactly that case. Both shapes in the fixture corpus, across a spring-forward and a fall-back.

What adopting the standard does not buy on its own: RFC 5545 says nothing about what a rule means at a DST gap or a repeated hour. Using the engine pg-boss uses does buy it, because the policy is then whatever `rrule-temporal` does and there is no second opinion in the system, but it still has to be pinned by the fixture corpus and reconciled against what the two services do today. Maestro's one-hour bump and CTENG's shift-forward-into-the-gap rule are the two behaviours a migration can visibly change.

`schedule()` also rejects more than the profile validator would think to: an unknown part (`BYHOURS=9`), a value out of range (`BYHOUR=25`, and the `25` in `BYHOUR=9,25`), a part named twice, a second `DTSTART` or `RRULE`, an `RDATE` or `EXDATE` whose value type differs from `DTSTART`'s, and the combinations RFC 5545 forbids outright such as `BYMONTHDAY` under a weekly frequency. Every one of those is a silently wrong fire time in a parser that merely drops what it cannot read, which is why they are rejections rather than warnings. The profile validator has to be a subset of that, and the way to know it is a subset is to run the corpus through `previewSchedule()`, which validates on exactly the same path.

**The two options, with the profile in hand**

Option A: **RRULE is the model, narrowed by a published profile.** `ScheduleDefinition` is canonical RFC 5545 text (`DTSTART;TZID` plus one to four `RRULE`s). Core ships `encode(form)`, `decode(text)` and a profile validator; product forms stay in each product's API contract.

Option B: **A product-neutral native model.** A zod schema with `frequency`, `interval`, `weekdays`, `times: {hour, minute}[]`, `hourWindow`, `monthDayPosition`, `timezone`, `startAt`. The engine consumes it directly, and RRULE text is produced only where a backend needs a string.

| Concern | A: RRULE plus a profile | B: native model, RRULE as an export |
| --- | --- | --- |
| Expressiveness | Anything RFC 5545 allows, narrowed to the profile. Growing it is an edit to a validator, and the ceiling is the standard's, not ours. | Exactly what the products need today. Every new capability is a schema change plus engine support, and the ceiling is whatever we thought of. |
| Round trip to the UI | Deterministic inside the profile: `decode(encode(form))` is the identity over the fixture corpus, and out-of-profile text decodes to `custom` for read-only display. Costs a decoder, roughly 150 lines and its tests. | Lossless by construction, no decoder needed. |
| Time pairs | One rule per time, and one backend schedule per rule, since neither pg-boss nor the engine takes a set. The facade groups them back on read. | `times[]` is a field, and the same fan-out happens one layer down, because the backend still takes one expression per schedule. |
| Whole-hour minutely windows | The `BYMINUTE`-under-`MINUTELY` trap becomes a profile rule, enforced by the validator and visible in the fixtures. | The trap stays inside the library behind `hourWindow`. |
| Validation | Profile validator, plus per-product refinements (maestro's 15-minute floor stays in maestro). | Zod schema plus the same per-product refinements. |
| Equality and change detection | String compare, made exact by canonical serialisation rather than brittle as maestro's current compare is. | Structural compare on normalised fields. |
| Adapters | One string for all transports: BullMQ's `pattern`, the pg-boss chain payload, and the pg-boss schedule row's own expression column, which takes RRULE text verbatim from 12.31.0. | Every transport needs the encoder anyway, so the same string exists, just derived. |
| Migration of stored data | Maestro's `triggerSchedulerExpression` already is RRULE text, no transform. CTENG keeps its columns and encodes on write. | Maestro maps its layout fields; CTENG maps field for field. Neither migrates storage. |
| Interop | A standard others can read: calendars, other teams, future tooling. The profile narrows what we emit and is published with the package. | Proprietary. Exportable, but every consumer outside our code has to be handed a converter. |
| Cost of being wrong | If the profile turns out too narrow, widen the validator. | If the model turns out too narrow, change the schema, the engine, both products' contracts and the stored rows. |

Recommendation for decision 2: **Option A, RRULE as the lingua franca**, with a published profile, a canonical encoder, a decoder that returns `custom` outside the profile, and the round-trip property test as the guarantee. The round-trip argument is what favours Option B, and the numbers undercut it: the subset in play is six rule parts, the decoder is one bounded decision tree over them, and RFC 5545 covers everything both products do today with room left over. Inventing a schema to avoid 150 lines of decoder means owning a ceiling forever.

What stays product-owned: CTENG's `frequency`/`days`/`times` REST contract and maestro's `RRULE_CONFIGURATION_SCHEMA` frontend contract. Neither changes. The library's job is the codec between those forms and the canonical rule, so a form remains what the UI edits and RRULE remains what the system stores, computes on and hands to a backend.

**How the two decisions combine**

RRULE in, `rrule-temporal` computing, the same string on every transport, and on the pg-boss adapter the same engine computing on both sides of the boundary. The engine is form to a list of canonical rules through the shared encoder (maestro's compiler, extended with `times[]`), then `rrule-temporal` per rule, wrapped in a timezone-safe `nextOccurrence` that answers with the earliest.

**The codec belongs in core, not in an adapter.** RRULE text is not a BullMQ artefact: BullMQ's `pattern`, the pg-boss chain's job payload and the pg-boss schedule row all carry the same string, and both products need the encoder to write a schedule and the decoder to render one. So core owns `encode`, `decode`, the profile validator and `nextOccurrence`, while an adapter only decides where the string travels and how the next fire is triggered. Nothing about the model differs per backend, which is part of what keeps the two adapters swappable.

When a runtime ships Temporal unflagged, `rrule-temporal` picks it up on its own (`globalThis.Temporal ?? bundled`) and the bundled copy stops being loaded, with no change on our side and none to the stored rules.

### Layer 2: trigger delivery (share, behind an adapter)

The library does **not** own a durable schedule registry. Both services already keep the user's structured configuration in their own tables (maestro in the workflow layout, CTENG on the `schedule` row), and that remains the canonical record. The delivery adapter's job is to make the next occurrence fire and to answer "when does this fire next". Interface:

```ts
type ScheduledJob = {
  id: string                       // stable per schedule, e.g. workflowId or scheduleId
  owner: string                    // tenant or team key, stored where each backend can filter on it
  recurrence: Recurrence           // 1 to 4 canonical rules; decode() renders them back to a product form
  payload: unknown                 // what the service needs at fire time
  catchUp: 'skip' | 'once' | 'all' // per-backend semantics in the table below
  lastFiredAt?: Date               // the service's own record of the last run, for catch-up
  nextRunAt: Date | undefined      // computed from the recurrence on read, never stored
}

type FireContext = {
  fireId: string                   // `${id}@${occurrence.toISOString()}`, same on every delivery
  firedAt: Date                    // the occurrence, not the delivery time
  db?: TransactionRunner           // only where the backend can commit with the domain write
}

interface DeliveryAdapter {
  schedule(job: ScheduledJob): Promise<void>            // register first occurrence
  reschedule(job: ScheduledJob): Promise<void>          // recreate with a new definition
  unschedule(id: string): Promise<void>
  get(id: string): Promise<ScheduledJob | undefined>
  list(f: { ids?: string[]; owner?: string; limit: number; cursor?: string }):
    Promise<{ jobs: ScheduledJob[]; cursor?: string }>  // live schedules only, never history
  onFire(handler: (job: ScheduledJob, ctx: FireContext) => Promise<void>): void
  onDispatchFailed(h: (job: ScheduledJob, ctx: FireContext, error: Error) => Promise<void>): void
}
```

A `Scheduler` facade composes the engine and one adapter and adds `previewOccurrences(recurrence, { from, count })`, `reconcile(desired: ScheduledJob[])` and a fire-delay metric. `reconcile` reads the backend through `list`, which is why `list` is bounded and cursored and returns live schedules only: a diff that pulls a busy key's history is both wrong and unbounded.

`nextRunAt` is derived, on every backend. pg-boss stores no next-occurrence column, so the read path is the stored expression plus the engine, which is the same arithmetic `previewOccurrences` does and the same the cron pass does. That removes a class of staleness rather than adding work: there is no cached fire time to drift from the rule beside it, and no daily recompute job to keep the two agreeing, which is what CTENG's `ScheduleNextRunRecomputeJobProcessor` exists to do today.

**Delivery is at-least-once, and `onFire` is not a transaction.** Every backend can deliver one occurrence twice: a handler that throws is retried, and so is a handler that finished its work but failed before acknowledging. `ctx.fireId` is identical on every delivery of the same occurrence, so it is what a handler writes its own idempotency row against; the library does not dedupe domain work on its behalf. `ctx.db` is pg-boss only, and it covers the handler's own writes: domain rows and any job the handler enqueues commit together. Completing the fired job in that same transaction needs the upstream `work({ transactional: true })` ask in "Smaller upstream follow-ups", so until it lands a fire is at-least-once on pg-boss too, and `fireId` rather than a transaction is what handlers rely on. `onDispatchFailed` runs when a delivery exhausts its retries, which is where a service marks the occurrence failed in its own tracking.

#### Fanning a recurrence out to one schedule per rule

A recurrence of one rule, which is every maestro schedule and every CTENG hourly one, is one backend schedule and none of this applies. A CTENG daily schedule at two or four times is two or four, keyed `${id}#0` upwards in first-occurrence order, and that has consequences worth stating before they are discovered:

- **Every group operation is a loop, and has to be atomic.** Register, reschedule and unschedule write the whole group in one transaction on pg-boss. On BullMQ they cannot be, so a partially applied group is possible there and `reconcile` is what repairs it, which is one more reason it ships in the first release on both adapters.
- **Reschedule has to remove what it no longer needs.** Going from four times to two leaves `#2` and `#3` firing forever if the write only upserts. The adapter deletes the tail as part of the same call.
- **Reads group by id, not by key.** `get(id)` returns one `ScheduledJob` whose `recurrence` is the group's rules in key order and whose `nextRunAt` is the earliest of theirs. `list` groups the same way, so a caller never sees `#1` as a schedule of its own.
- **`fireId` already carries the occurrence, so nothing downstream needs the index.** `${id}@${iso}` is unique across the group because two rules of one recurrence have distinct times by construction, which is why they are separate rules at all. A handler stays unaware of the fan-out.
- **The index is derived, never stored by the caller.** It comes from position in the canonical, ordered recurrence, so an encode of the same form always produces the same keys and a reschedule that changes one time does not renumber the others.

The alternative is a rule per backend row with the grouping in the product's own table, which is where CTENG's `times[]` already lives. That works, and it pushes the loop and its atomicity into two services instead of one library, so it is the fallback if grouping in the facade turns out to leak.

#### pg-boss adapter

**What it gives**

- **Durability.** A lost schedule means a revenue-generating workflow silently stops running, which is CUJ-002's failure mode. Redis persistence is best-effort by design: RDB snapshots lose everything since the last dump, AOF at the default `everysec` loses up to a second of acknowledged writes, and a failover promotes a replica that may be behind. Postgres commits are synchronously durable.
- **One backup story.** The schedule sits in the database that already has backups, point-in-time recovery, replication and monitoring, so there is one thing to restore rather than two.
- **Transactional writes.** Registering, rescheduling and unscheduling commit in the same transaction as the domain row they belong to, so a saved schedule and a registered schedule cannot diverge.

**What it costs**

- A new dependency and a `pgboss` schema for any service that does not already run it.
- Fire precision bounded by the poll interval rather than Redis latency. Not the deciding factor for schedules that fire minutes to months apart, but real. A job is filed under the minute its occurrence falls in, so a schedule finer than a minute sends one job a minute. Both products' floors are well above that (maestro's is 15 minutes, CTENG's is hourly), so it costs nothing today and would cap a future "every 30 seconds" ask.
- No missed-occurrence policy until the upstream follow-up lands, so catch-up is the facade's, described under "Catch-up while there is no `missed` option".
- Before 12.31.0, the chain described under "If 12.31.0 is not released when the adapter is due".

**How it works**

1. `schedule(job)` passes each rule through as the expression, once per rule in the recurrence. There is no format argument: `schedule()` reads the expression, decides it is a rule, and records that in the row's `kind`. `owner` sits at the top level of the schedule data so `list` can filter on it.

   ```ts
   boss.schedule(queue, rule, { owner, payload, index }, { key: `${id}#${index}`, tz })
   ```
2. pg-boss evaluates the rule on each pass and forwards a job to the queue for every occurrence in the last minute; the worker handler invokes `onFire`.
3. `reschedule(job)` is the same calls again, an upsert on `(name, key)`, plus an `unschedule` of any index the new recurrence no longer has. `unschedule(id)` removes every key in the group. `get(id)` reads the group's rows and computes the fire time from the earliest of them.

   ```ts
   const schedule = await boss.getSchedule(queue, `${id}#0`)
   const [nextRunAt] = boss.previewSchedule(schedule.cron, { tz: schedule.timezone, from, count: 1 })
   ```
4. Every write takes `{ db: fromDrizzle(tx, sql) }`, so `schedule`, `reschedule` and `unschedule` join the caller's transaction, as does anything the fire handler enqueues. Both drizzle drivers in use are covered (postgres-js in maestro, node-postgres in CTENG). A fanned-out recurrence writes its rules in one transaction, so a group is never half-registered.

Two details of the read path are worth pinning down, because both are easy to get subtly wrong.

`previewSchedule()` defaults `from` to the instance's clock plus the skew it has cached against the database, and that skew is only cached by an instance started with scheduling enabled. A process that reads schedules without running the timekeeper therefore gets its own local clock, so the adapter passes `from` explicitly rather than taking the default. The call is synchronous and CPU-bound, with a one-second internal budget, so a list read previews one occurrence per schedule rather than several.

`lastJobId` on the schedule row points at the job the schedule most recently created, which is what an operator needs to get from a schedule to its last run. It is written best-effort in a separate statement, so `null` means "no run recorded" rather than "never fired", and the id can outlive the job it names once retention has removed it. So it is good for ops tooling and for a "last run" column, and it is not a substitute for the service's own execution tracking. Catch-up does not depend on it.

No daily DST recompute is needed: every occurrence is computed from the rule in the timezone it carries, on every read and on every pass. Retention is anchored to `start_after`, so month-ahead occurrences survive until they fire. Fixed housekeeping jobs (maestro's `detect_stuck_workflow_runs` and `tasks_about_to_expire`, CTENG's cleanup jobs) stay on cron expressions, which is the same `schedule()` call with a string in the other format.

`reconcile(desired)` ships in the first release. Each service feeds it from "Live scheduled workflows" or "enabled schedules" on a periodic job, and the library diffs against what the backend holds, then sends or cancels. It is what closes CUJ-002's silent-missing-schedule failure mode, which has no equivalent today, and it is mandatory rather than merely useful on the chain, where a series can die with a handler. On the native strategy it is also where catch-up happens, and it reads the whole schedule table for the queue, since `getSchedules(name)` takes no filter, limit or cursor. That is one row per schedule rather than per job, so it is fine at CTENG's scale and wants the bounded read listed under "Smaller upstream follow-ups" at maestro's, where one queue holds a row per scheduled workflow.

**Catch-up while there is no `missed` option**

pg-boss sends an occurrence only while it is inside the last 60 seconds, so an occurrence that falls while no instance is running the timekeeper is not sent late, it is not sent at all. Both products fire it late today: CTENG's runner picks up anything with `next_run_at <= now()` on its next tick, and BullMQ's scheduler fires one overdue occurrence on resume. So `catchUp: 'skip'` is not the behaviour either service has, and adopting the adapter with it would quietly turn every deploy window into lost runs.

Until upstream takes a `missed` option, the facade does the catch-up, in the reconcile pass:

- `desired` carries `lastFiredAt`, which each service already has (CTENG's `schedule_execution` rows, maestro's run history). It is the service's record, not pg-boss's, because that is the only one that reflects domain work actually done.
- For each schedule, the pass enumerates occurrences between `lastFiredAt` and the pass's own clock, drops what the 60-second window has already delivered, and sends the remainder as ordinary jobs under the occurrence's own `fireId`, so a replay cannot duplicate a fire that did happen.
- `skip` sends none of them, `once` sends the latest, `all` sends every one in ascending order, capped at 1000 per schedule.

The cost is that catch-up latency is the reconcile interval rather than the poll interval, which is right for a policy about occurrences that are already late. The benefit is that all three values work on both adapters from the first release, so the capability matrix has no hole to explain and the upstream option, when it arrives, replaces an implementation rather than changing a contract.

#### BullMQ adapter

Wraps BullMQ job schedulers as maestro does today, with the engine's `nextOccurrence` supplied as `repeatStrategy`. Maestro adopts the library through it and deletes its three hand-rolled `QueueManager` subclasses without changing what fires when. It is supported on the same terms as the pg-boss adapter, with no deprecation.

- `get()` returns the recurrence and the next fire time, the same as the pg-boss adapter, by carrying each rule in its job scheduler's template data. Confirmed against the bullmq 6 job-scheduler API that `background-jobs-common` develops against: `getScheduler(key)` returns `template.data` alongside `next`, `pattern` and `tz`. This requires `upsertJobScheduler`, not the legacy repeatable path, which stores the pattern only.
- One job scheduler per rule, keyed the same `${id}#${index}` way as on pg-boss, so a multi-time recurrence looks the same from the facade on either backend.
- The pattern-compare-then-remove logic for edits moves into the adapter so the dedup edge case is handled once.
- Redis is the firing source of truth here, so `reconcile` matters more on this adapter than on pg-boss, where the pending row is covered by the service's own backups. It ships in the first release for both.
- No transactional writes: registering a schedule cannot be committed with the domain row it belongs to, and neither can anything the fire handler enqueues, so `ctx.db` is absent here, and a fanned-out group's writes cannot be atomic either. That is inherent to Redis plus Postgres, so it belongs in the capability matrix rather than in the adapter's backlog.
- Catch-up runs the same way it does on pg-boss native, out of the reconcile pass, rather than relying on the scheduler's own resume behaviour. The scheduler gives `once` and nothing else, and taking it would make `all` a pg-boss-only capability for no reason other than which code path answers.
- Housekeeping cron schedules stay on BullMQ's own repeat handling, matching what pg-boss's `schedule()` does with a cron expression on the other side.

#### Keeping the two adapters interchangeable

Two equally supported backends stay equal only if the library enforces it:

- **One conformance suite, run against every backend.** The same test file, parameterised over adapters (Redis container, Postgres container), covering register, reschedule, unschedule, read, list, missed occurrences, DST boundaries and reconcile. This is the mechanism that keeps "adopting the library does not commit you to a backend" true.
- **The facade never leaks a backend identifier.** No pg-boss job id, no BullMQ scheduler key, in any return type. Callers key on their own schedule id.
- **The option surface is what both adapters can honour.** An option only one backend can implement goes in the capability matrix and is rejected at call time by the other, rather than silently behaving differently. `catchUp` is the one that has to be written down, because each backend has an accidental answer today:

  | `catchUp` | pg-boss native | pg-boss chain | BullMQ |
  | --- | --- | --- | --- |
  | `skip` | the 60-second window is the whole of it: an occurrence older than that was never sent | the handler still chains the successor, and skips `onFire` when the occurrence is older than one poll interval | the adapter skips `onFire` on the same rule; the scheduler keeps running |
  | `once` | reconcile sends the latest occurrence after `lastFiredAt` | the overdue job fires, and the successor is computed from now | the scheduler's own behaviour: one overdue occurrence fires on resume |
  | `all` | reconcile enumerates them, capped at 1000 per schedule | the engine enumerates the missed occurrences, capped at 1000, each sent under `${id}#catchup:${iso}` so a retry cannot duplicate one | reconcile enumerates them, capped at 1000 per schedule |

  Replayed occurrences are sent in ascending order, and each carries its own `fireId` and `firedAt`. Delivery order is not guaranteed once more than one worker is running, so a handler that cares about sequence orders on `firedAt`. All three values are honoured on all three paths, at the cost of the facade owning the policy on two of them, which is what keeps both the adapter choice and the strategy switch in the next section invisible to callers. When upstream takes a `missed` option, the native column becomes a pass-through and nothing above it changes.
- **Capability matrix, published with the package.** Transactional writes are pg-boss only. Fire precision differs by an order of magnitude and in kind: BullMQ fires at the computed millisecond, pg-boss files a job under the minute the occurrence falls in. Batching semantics, retention and what the read path returns are all matrix rows, filled from the conformance suite rather than from prose.
- **Backend-specific constraints stay inside their adapter.** The 24-hour cap on `active` time is pg-boss's, so "enqueue domain work rather than running it inline" is guidance in that adapter's docs, and core imposes it on nobody.

### Showing and changing the recurrence for the end user

This is an explicit requirement, covered as follows.

**Today**

- Maestro keeps the structured configuration in the workflow layout's `TriggerStep` settings. The UI reads from there; BullMQ only sees the compiled string. Change goes through `UpdateLiveWorkflowUseCase`: save the layout, compile, compare with the stored scheduler pattern, remove if different, re-add.
- CTENG stores the structured fields on the `schedule` row and returns them through `GET /v1/schedules`. Change is an upsert that recomputes `next_run_at`.

Both services already treat the structured definition as canonical and the runtime artefact as derived. The library preserves that.

**What the library guarantees**

- `ScheduledJob.recurrence` is the canonical rules the caller passed in (or that `encode(form)` produced from their form). pg-boss carries each in the schedule row's own expression column, or in the job payload on the chain; BullMQ in the scheduler template data and as `pattern`. It is the same string on every transport, so the read path returns the same thing regardless of backend, and `decode` turns it back into a form for rendering.
- `scheduler.get(id)` returns the recurrence plus `nextRunAt`, so a UI can render "every weekday at 09:00 Europe/Berlin, next run 2026-09-10 07:00 UTC" from one call. Both adapters answer it: pg-boss from the schedule rows of the group, with the next occurrence computed by `previewSchedule`, BullMQ from the job scheduler's template data and `next`.
- `scheduler.previewOccurrences(recurrence, { from, count })` runs the engine only, so a form can show the next few runs before saving, with nothing stored and no instance started.
- `scheduler.reschedule(job)` is the change path. On pg-boss it is an upsert per rule on `(name, key)` plus a delete of any key the new recurrence dropped; on BullMQ it is compare, remove, re-add.
- Human-readable rendering (CTENG's `formatScheduleLocalTime`, maestro's form labels) stays in each product because it needs localisation. The library may ship `describe(recurrence)` for logs and admin tooling.

**Where the definition lives per adapter**

| Adapter | Where the rules are readable | Notes |
| --- | --- | --- |
| pg-boss | The schedule row's expression column natively, pending job payload on the chain | Meets the requirement on its own, and from 12.31.0 the row also carries `kind` and `lastJobId`, so "which format" and "what did it last run" are readable without a join. Products keep their own row for listing and history. |
| BullMQ | Job scheduler template data, via `getScheduler(key)` | Requires `upsertJobScheduler` rather than the legacy repeatable path. Products keep their own row for listing and history. |

`list` filters on the top-level `owner` key in the schedule data. On pg-boss native that filter runs in the adapter, because `getSchedules(name)` returns every row for the queue with no filter, limit or cursor; on the chain it is `findJobs({ data: { owner } })`. Either way it is adequate for admin tooling, and customer-facing lists come from the product tables.

### Layer 3: execution tracking and domain dispatch (do not share)

CTENG's `schedule_execution` model (conflict keys, queued drains, Autopilot correlation, TTL recovery) and maestro's `RunWorkflowJob` (start a workflow run, entitlement checks, delay histograms) are domain code. The library exposes `onFire` and `onDispatchFailed` and leaves the rest to the service.

## pg-boss: the primitives the adapter uses

Checked against 12.30.0 and [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898). Only what shapes the design is listed.

| Primitive | What the adapter does with it |
| --- | --- |
| `schedule(name, expression, data, { key, tz })`, where the expression is a rule from 12.31.0 | The registry itself: one row per rule keyed `(name, key)`, re-callable as an upsert. The format is detected, not declared, and recorded in the row's `kind`. |
| `getSchedule(name, key)` and `getSchedules(name)`, reporting `kind`, the expression, `timezone`, `createdOn`, `updatedOn` and `lastJobId` (12.31.0) | `get()` reads one row; `list()` reads the queue's rows and filters and groups in the adapter, since neither call takes a filter, limit or cursor. |
| `previewSchedule(expression, { tz, from, count })` (12.31.0) | `nextRunAt` on every read, and `previewOccurrences` for a form. Synchronous, no database, and it runs `schedule()`'s own expression and time zone validation, so it doubles as the storability check for the fixture corpus. The one thing it does not apply is `schedule()`'s refusal to store a rule with no occurrences left, which shows up here as an empty result instead. |
| `send(name, data, { startAfter, singletonKey })` on a `short` queue | The bridge if 12.31.0 is not out yet: one pending occurrence per key, unlimited concurrent actives, a duplicate send resolving `null` instead of throwing. Also how facade-level catch-up replays a missed occurrence on the native strategy. |
| `upsert`, `findJobs(name, { key, queued: true })`, `cancel` | Reschedule in one statement, read the pending occurrence, stop a series. |
| `{ db: fromDrizzle(tx, sql) }` on every write | Registering or cancelling a schedule commits with the service's domain write, and a fanned-out group commits whole. Covers both drizzle drivers in use: postgres-js in maestro, node-postgres in CTENG. |
| `keep_until = start_after + retentionSeconds` | A month-ahead occurrence is not garbage-collected before it fires. |

Four constraints to design around:

- `expireInSeconds` caps `active` time at 24 hours, so the fire handler enqueues domain work instead of running it inline.
- `useListenNotify` needs a session-pinned connection and does not work through PgBouncer in transaction mode. Accept poll-interval precision, or give pg-boss a direct connection.
- A job is filed under the minute its occurrence falls in, so a schedule finer than a minute sends one job a minute. Two occurrences in separate minutes both send, however close together.
- An occurrence is due for 60 seconds and no longer, and nothing records that it went unsent, so "the timekeeper was down" and "the schedule has no occurrences" look identical from the schedule row. Catch-up therefore needs a last-fired time from outside pg-boss, which is why `ScheduledJob.lastFiredAt` exists.

## Upstream: RRULE expressions land in 12.31.0

In 12.30.0, the current release, `schedule()` takes a cron string and nothing else: the timekeeper evaluates `cron-parser`'s `prev()` against database time every 30 seconds, sends when `prevDiff < 60`, and deduplicates across instances with `singletonSeconds: 60`.

The change that fixes it is written and open as [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898) (27 files, migration v41, tests and docs). **This document plans on it being adopted.**

What it changes upstream:

- RRULE is a built-in expression format rather than a plugin point. A rule goes in the same string argument a cron expression goes in, and an expression carrying a `FREQ=` part or opening with an iCalendar property is read as one. Occurrences come from `rrule-temporal`, which pg-boss now depends on.
- `kind` joins the `schedule` row, holding the format `schedule()` detected, and it is a hint rather than a verdict: a pass that cannot read an expression the way the column says, and finds it written the other way, reads it as written and repairs the column. So a row that loses its label to a schema rollback or to an upsert from an older instance keeps firing.
- `last_job_id` joins the row, so a schedule points at the job it most recently created.
- `getSchedule(name, key)` reads the single row a `(name, key)` pair can have, and `previewSchedule(expression, { tz, from, count })` answers "when does this fire next" for either format, synchronously and without a database.
- Each pass reads the whole 60-second window with `between()` rather than one occurrence, and files each job under the minute its occurrence falls in, so two occurrences in separate minutes both send. The 60-second throttle stays, so the one-job-a-minute ceiling stays with it.
- The forwarded job's singleton key becomes JSON `[name, key]` rather than `${name}__${key}`, which stops a queue name and a key that both contain underscores from colliding.

What it deliberately does not change, and what that costs us:

- **No persisted `next_run_at` or `last_run_at`.** Every fire time is computed from the expression, on the pass and on every read. `previewSchedule()` is the read, `lastJobId` is the closest thing to a last-run record, and the library's `nextRunAt` is derived rather than looked up. This is the design that removes the staleness class CTENG's daily recompute job exists to fix, so it suits us.
- **No missed-occurrence policy.** `missed: 'skip' | 'once' | 'all'` is named in the PR as separable and worth landing on its own, and is not in it. Until it does, an occurrence that falls while no instance runs the timekeeper is simply not sent, and catch-up is the facade's, per "Catch-up while there is no `missed` option".

What the adapter becomes on top of it: `schedule` and `reschedule` are `boss.schedule` per rule, `unschedule` is `boss.unschedule` per key, `get` is `boss.getSchedule` plus `previewSchedule`. The schedule row is the registry, so there is no chain, no `singletonKey` bookkeeping and no payload scraping. `reconcile` does not narrow to a consistency check, though: it stays the catch-up mechanism as well, until the upstream `missed` option lands. Ours to keep: the codec and profile, the fan-out and grouping, catch-up, and `previewOccurrences` over a multi-rule recurrence.

### If 12.31.0 is not released when the adapter is due

The adapter ships the same public surface over a self-perpetuating chain of deferred jobs, then switches to native recurrence internally:

1. `schedule(job)` computes the first occurrence of each rule and calls `send(queue, { id, rule, index, payload }, { startAfter: fireAt, singletonKey: `${id}#${index}` })`, so a recurrence is one chain per rule under the same keys the native strategy would use.
2. The handler computes the next occurrence from the rule in the job data, sends the successor with the same `singletonKey`, then invokes `onFire`. Under the `short` policy at most one job per key sits in `created`, so a retried handler cannot double-book the series. It can repeat the fire, though: the successor send has already committed when `onFire` runs, so a handler that fails after that point is retried against a successor that exists. `ctx.fireId` is what stops the domain work happening twice, and the window is a test case rather than a caveat.
3. `reschedule` is `upsert` by `singletonKey`, plus a cancel of any index the new recurrence dropped; `unschedule` is `findJobs` then `cancel` across the group; `get` reads each pending job's `data.rule` and `startAfter`.
4. `reconcile` is mandatory here rather than merely useful: if a handler exhausts its retries before sending the successor, the series dies silently and only the domain table can recover it.

Switching later costs no caller change and no migration of running schedules, provided three rules hold from the first commit:

1. **No backend identifier crosses the facade.** A schedule's identity is a pending job id on the chain and a `(name, key)` row natively. Neither may reach a domain column, a log line or a dashboard query. The `${id}#${index}` keys are shared by both strategies, which is what lets a group convert one rule at a time.
2. **The option surface is what both strategies honour in full.** Both honour all three `catchUp` values, per the table in "Keeping the two adapters interchangeable", the chain in its handler and the native strategy in the reconcile pass, so no caller sees a default change when the strategy flips. Shipping `once` only and adding `skip` and `all` later would change behaviour under callers who took the default.
3. **One mechanism per key, enforced by the adapter.** A pending chain job lives in `pgboss.job` and a native schedule in `pgboss.schedule`, so nothing in the database stops a key existing in both, and a key in both fires twice. `reconcile` is where the check belongs.

Existing series convert themselves, in one transaction per key:

- **On fire.** The handler writes the schedule row instead of sending a successor, in the transaction that completes the fired job.
- **On write.** Any `schedule` or `reschedule` cancels the pending chain job and inserts the schedule row.
- **On reconcile.** The periodic pass converts the remainder, which is what forces the tail instead of waiting a year for an annual schedule.

A job already `active` at conversion time fires once more on the chain and converts on completion. What needs a deadline is the code, not the jobs: a chain series has no natural end, so only `UNTIL` and `COUNT` definitions drain by themselves. Run the adapter suite twice, once per strategy, the way step 2 runs both engine implementations side by side.

The version gate is deployment-wide, not per-process, and the rolling-upgrade window is the part to plan for:

- Migration v41 ships in 12.31.0, adding `kind` and `last_job_id` in one pass over the `schedule` table, and backfilling `kind` from the expression so a rolled-back and re-upgraded database gets its labels back.
- `contractor.start()` migrates only when the library's schema version is ahead of the stored one, so a 12.30.0 instance against a v41 schema runs rather than erroring.
- A 12.30.0 instance reads a stored rule as a cron expression, fails to parse it, warns `invalid_schedule` and skips the row. So a rule schedule does not fire, and does log, for as long as any instance is still on the old release. Write rules only once the deployment is fully upgraded, which for us means the dependency bump lands before the strategy flip rather than with it.
- The singleton key of a forwarded cron job changes format in 12.31.0, so during a rolling upgrade an old and a new instance filing the same occurrence do not collide and a cron schedule can fire twice in the straddled minute. Handlers are idempotent on `fireId` anyway, which is what makes this a note rather than a blocker, and it is one more reason the upgrade window should be short.

A rule schedule fires only while at least one upgraded instance runs the timekeeper, so flip the strategy by config once the dependency bump has rolled out everywhere, and treat capability detection as an assertion.

### Smaller upstream follow-ups

`getSchedule`, `previewSchedule` and `lastJobId` are in [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898). What is left, in the order it matters to us:

- **`missed: 'skip' | 'once' | 'all'` on `schedule()`**, capped at a bounded number of occurrences per schedule. The PR names it as separable and not included. It is the one follow-up that removes library code rather than adding a convenience: catch-up stops being the facade's job and becomes a column. Until then the facade owns a policy that belongs to the timekeeper, and the latency of a late fire is the reconcile interval.
- **A bounded read of the schedule table**: `getSchedules(name, { data, limit, cursor })`, or any filter at all. Today the call returns every row for a queue, which `list()` and `reconcile()` then filter and group in memory. One row per schedule keeps that cheap, and maestro's shape is one row per scheduled workflow on a single queue.
- `work(name, { transactional: true }, (job, tx) => ...)`. Today, running fetch, side effects and `complete` in one transaction means bypassing `work()` and reimplementing its polling, batching, heartbeats and error handling.
- `findJobs` filters: `states`, `limit`, `orderBy`, a cursor, and a `getJobByKey(name, key)`. Only the chain strategy needs these, so they matter only if the chain ships.
- Docs: `keep_until` anchoring to `start_after`; which job states each queue policy's `singletonKey` index covers.

### How this shapes the plan

- The pg-boss adapter is built last (step 5 of the migration outline). By then 12.31.0 is the likely target and the chain may never be written.
- Native recurrence is an internal strategy of the one pg-boss adapter, never a second adapter, gated on the whole deployment running 12.31.0 or newer.
- Nothing in steps 1 to 4 depends on the release: they are the engine, the codec, the facade and the BullMQ adapter. Step 1 does depend on the engine choice, and choosing the engine pg-boss uses is what makes step 5 a mapping rather than a reconciliation, so it is settled first even though its payoff arrives last.
- Catch-up ships with the facade in step 3, not with the pg-boss adapter, because BullMQ needs `all` too and neither backend gives it for free. If the upstream `missed` option lands before step 5, the native strategy passes it through and the facade implementation stays for the other two paths.

## Extract versus a parallel mechanism in CTENG

The question as posed assumes CTENG has nothing. It does, so the real alternatives are:

| Option | Description | Verdict |
| --- | --- | --- |
| A. Status quo | Two independent designs, no shared code | Cheapest now. Two DST implementations, two sets of edge cases, no durable path for maestro. |
| B. Copy maestro's BullMQ scheduler into CTENG | Add a BullMQ job-scheduler path next to the Postgres runner | Worst option. CTENG would gain a less durable second mechanism, a native dependency, and Redis as a source of truth for something it already keeps in Postgres. |
| C. Extract recurrence engine only | New pure package, both services adopt | Low risk, clear value, no infrastructure change. Happens regardless. |
| D. Extract engine plus delivery facade with both adapters supported | C, then maestro on the BullMQ adapter (no runtime change), then CTENG on the facade, with a backend switch available to either service later | Medium effort. Both services end on one shared mechanism with the backend as configuration: CTENG gains per-occurrence precision and the richer recurrence model, maestro gains `reconcile` and a durability option it can exercise when the org decision lands, and neither is forced to change infrastructure to adopt the library. |

Recommendation: **C immediately, D incrementally**, in the order below.

## Proposed package

`@lokalise/scheduling-common` under `packages/app/`, with entry points so consumers only pull what they use:

- `@lokalise/scheduling-common` (core): the RRULE profile and its validator, `encode` and `decode` for both products' forms, `nextOccurrence`, `DeliveryAdapter` interface, `Scheduler` facade with `previewOccurrences`, `reconcile` and catch-up, fire-delay metric helper. The codec lives here rather than in an adapter, because every backend carries the same RRULE string.
- `@lokalise/scheduling-common/pg-boss`: native and chain strategies, queue setup (`short` policy), worker registration, transactional send helper, the fan-out and grouping of a multi-rule recurrence. `pg-boss` as an optional peer dependency, `>=12.31.0` for the native strategy.
- `@lokalise/scheduling-common/bullmq`: job-scheduler adapter, supported on equal terms with the pg-boss entry point. `bullmq` as an optional peer dependency.

Dependencies of core: `zod`, `rrule-temporal` pinned to the range pg-boss pins, `cron-parser` for legacy cron patterns. No dependency on `background-jobs-common`, `ioredis`, `bullmq` or `pg-boss` in core. Node 22.12 or newer, which is pg-boss's own floor and `rrule-temporal`'s. The conformance suite runs against both entry points, so the package's docker-compose needs a Postgres container alongside the Redis one `background-jobs-common` already uses.

The pin on `rrule-temporal` is a deliberate coupling, not caution about a young dependency. Two versions of the engine in one install means the library previewing occurrences one way and pg-boss firing them another, which is the exact failure the engine choice exists to prevent, so the range moves when pg-boss's does and the conformance suite is what says it may.

## Migration outline

1. **Engine package.** Move `rruleUtils.ts` and `rruleRepeatStrategy.ts` (minus the metric coupling) into the new package as the encoder and the iteration wrapper, with `rrule-temporal` in place of `rrule-rust` underneath. Publish the profile and its validator, extend the encoder with explicit time pairs and CTENG's weekday numbering, and add the decoder with the `decode(encode(form))` property test over both services' fixtures. Two checks gate this step: maestro's existing corpus green on the new engine, and every fixture accepted by pg-boss's own `previewSchedule()`, which is a pure call and needs no container. Maestro adopts by import swap; `maestro-common` keeps `RRULE_CONFIGURATION_SCHEMA` as its frontend contract, now one of the codec's input forms.
2. **CTENG adopts the engine.** `computeNextRunAt` delegates to `nextOccurrence`. Storage and runner unchanged. Run both implementations side by side in tests over a year of dates in the timezones CTENG customers use, then delete the local implementation. This is where CTENG's `times[]` first becomes a list of rules, still behind its own storage.
3. **Facade and BullMQ adapter.** Build the `Scheduler` facade, the `DeliveryAdapter` interface, `reconcile` and catch-up, then the BullMQ adapter as a thin wrapper carrying maestro's pattern-compare-then-remove logic. No pg-boss yet. Settle the `catchUp` option set here, since it is what keeps the later pg-boss strategy switch invisible, and the fan-out and grouping of a multi-rule recurrence, since BullMQ needs it as much as pg-boss does.
4. **Maestro on the BullMQ adapter.** Replace `RunWorkflowJobScheduler`, `DetectStuckWorkflowRunsJobScheduler` and `TasksAboutToExpireJobScheduler` with facade calls. Add the periodic `reconcile` fed from Live scheduled workflows. The CLI script switches to `scheduler.list()`. No runtime behaviour change; CUJ-002's missing-scheduler failure mode gains a recovery path.
5. **pg-boss adapter, strategy decided on arrival.** Native strategy only if [timgit/pg-boss#898](https://github.com/timgit/pg-boss/pull/898) is released by then; otherwise the chain under the three rules in "If 12.31.0 is not released when the adapter is due", plus the conversion path and its end date. Full test suite either way (upsert reschedule, group fan-out and tail deletion, retention, transactional send, reconcile, catch-up), run once per strategy the release contains. The conformance suite starts running against both adapters here. The remaining upstream proposals get filed alongside, `missed` first.
6. **CTENG on the facade.** Replace `ScheduleRunnerJobProcessor` and `ScheduleNextRunRecomputeJobProcessor` with the facade: on save, `schedule` or `reschedule`; the `onFire` handler runs today's `executeScheduleInTransaction` logic and `schedule_execution` tracking unchanged. `next_run_at` becomes a cached display value populated from `get()`, or is dropped, and the daily recompute job goes with it, since nothing caches a fire time any more. Fire precision improves from tick granularity to per-occurrence, within the one-job-a-minute ceiling. `schedule_execution` becomes the `lastFiredAt` catch-up reads, which is the piece that keeps CTENG's current "fire the missed occurrence once" behaviour intact: without it, adopting the pg-boss adapter would silently turn a deploy window into skipped runs. On the pg-boss adapter, since CTENG runs no Redis for this and the schedule stays in the database it already backs up; that is CTENG's call to make, and the BullMQ adapter would work too at the cost of new infrastructure.
7. **Backend changes are available, not scheduled.** Maestro on pg-boss is one config swap plus a cutover (register on pg-boss and unregister from BullMQ on next activation or edit, then `reconcile` the remainder in a controlled batch), and CTENG on BullMQ is the mirror image. Neither is planned here. Both wait on the org-level decision about which paths are recommended, and the point of steps 1 to 6 is that whichever way it goes, the work is a cutover rather than a rewrite. Independently of it: delete maestro's dead `SCHEDULER_REDIS_*` config.

## Risks and things to settle early

- **Model unification.** Recommended: RRULE as the canonical model, narrowed by a published profile (decision 2 in "Engine and model: trade-offs"). The remaining work is agreeing the profile, extending maestro's encoder with `times[]` and CTENG's weekday numbering, and writing the decoder plus its round-trip property test. Two profile rules exist to stop known traps: no `BYMINUTE` under `FREQ=MINUTELY`, and `BYMONTHDAY` taken from `DTSTART` and limited to 1 to 28 or `-1` (maestro's `monthDayPosition: 'current'` currently reads the compile date, which is a live bug worth fixing there regardless).
- **Engine choice.** Recommended: `rrule-temporal`, the engine pg-boss uses from 12.31.0, pinned to the range pg-boss pins (decision 1). It is pure JS with one types-only dependency and needs no polyfill, and choosing it means the library and the backend cannot disagree about when a rule fires. What it costs is maestro giving up `rrule-rust`, which has more of our own production mileage than the replacement does, and a young dependency at the centre of two products' scheduling. The pin, the fixture corpus and step 1's side-by-side run are the three things that make that acceptable, and none of them is optional.
- **Behavioural drift during migration.** Two engine swaps happen, not one: maestro moves from `rrule-rust` to `rrule-temporal` and CTENG from hand-written Intl arithmetic to the same. Maestro's DST one-hour bump and CTENG's shift-forward-into-the-gap rule can each disagree with it at transition instants, and a sub-daily `INTERVAL` drifts an hour across a transition where `BYHOUR` does not. The side-by-side runs in steps 1 and 2 are the guard, over a year of dates in the timezones each product's customers use.
- **Fan-out of a multi-time recurrence.** A CTENG schedule at two to four times a day is that many backend rows, so register, reschedule, unschedule, read and reconcile all operate on a group. The traps are a reschedule that shrinks the recurrence and leaves the tail firing, and a partially applied group on BullMQ, where the writes cannot share a transaction. Both are conformance-suite cases. If grouping in the facade leaks into callers anyway, the fallback is to keep the grouping in each product's own table, where CTENG's `times[]` already is.
- **pg-boss is new infrastructure for whoever adopts it.** A `pgboss` schema in that service's database, automatic migrations on `start()` (pin the version and disable `migrate` on all but one instance during upgrades), a `pg` pool alongside the existing driver, and poll-interval fire precision. Runbooks change with the backend: on pg-boss, CUJ-002's recovery step becomes "check pending jobs in `pgboss`, run reconcile". This is a cost of choosing the backend, not of adopting the library.
- **Supporting two backends is a standing cost.** Two adapters, two container setups in CI, two runbooks, and a parity contract that has to be maintained as either backend evolves. Picking one now would be cheaper, and that is exactly the call being deferred to the org-level decision, so the cost is accepted deliberately. Keep it bounded by putting parity in one conformance suite and refusing per-backend options in the facade.
- **A dead schedule is silent without reconcile.** `reconcile` ships in the first release and both services run it periodically. What counts as missing differs per backend, and the wrong predicate either hides the outage or pages on healthy schedules: on the chain a live schedule has a pending job, on BullMQ it has a job scheduler with a `next`, and on pg-boss native it has only a schedule row whose expression still yields a future occurrence, with no pending job at all between fires and nothing on the row to read. `list()` is what normalises that, computing liveness through `previewSchedule` on the native path, so the alert stays one diff against the domain table.
- **If the chain ships, its dual path needs an end date up front.** Converting a key on fire, on write or on reconcile keeps callers untouched, but an open-ended series never drains by itself, so without a date the chain code and the dual read outlive their purpose. Set the date when `reconcile` force-converts the remainder in the same release that ships the chain.
- **Read path on the BullMQ adapter.** Returning the structured definition depends on `upsertJobScheduler` template data and on maestro's adapter not falling back to the legacy repeatable path. Verify it against the bullmq version each consumer pins, in the conformance suite, before promising callers a uniform `get()`. If it does not hold on a pinned version, the definition comes from the service's own row on that adapter, as it does in maestro today.
- **Missed-occurrence policy is the sharpest open item, because pg-boss native has no answer of its own.** CTENG fires a missed occurrence on its next tick and BullMQ fires one on resume, so both products behave as `catchUp: 'once'` today. Native pg-boss sends an occurrence only inside a 60-second window and records nothing when it does not, so its behaviour is `skip` and adopting it unchanged would turn every deploy window into lost runs. The design's answer is catch-up in the facade's reconcile pass, driven by a `lastFiredAt` each service already records, which gives all three values on every path. That is a real piece of library code with a real failure mode (a wrong or missing `lastFiredAt` either replays or drops), it ships in step 3, and it is deleted when the upstream `missed` option lands. Two things to settle before the first release: which value each product wants as its default, and whether the org would rather wait for `missed` upstream than carry catch-up here.
- **Ownership.** A shared scheduler touches revenue-critical paths in two teams' services. Agree on a code owner in `shared-ts-libs` before step 3.
- **The upstream PR is not merged.** Everything in "Upstream: RRULE expressions land in 12.31.0" is read off an open pull request, so the expression grammar, the `kind` semantics and the `previewSchedule` signature can change in review. The parts of the plan that depend on it are the pg-boss native strategy and the engine pin, both in step 5 and both deliberately last. Steps 1 to 4 are unaffected, and the chain strategy is the standing fallback if the PR stalls or lands differently.
