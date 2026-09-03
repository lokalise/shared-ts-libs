# Extracting scheduling from maestro into a shared library

Analysis date: 2026-09-02. Repositories inspected: `maestro`, `content-type-app-engine` (CTENG), `shared-ts-libs`. pg-boss facts checked against 12.29.0 and against [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886), the pluggable-recurrence change queued for 12.30.0 that this design assumes.

## Summary

- **CTENG already has a scheduling mechanism in production.** It stores schedules in Postgres with a `next_run_at` column, and a single-consumer periodic job ticks on a cron and dispatches whatever is due. Maestro uses BullMQ job schedulers with a custom RRULE repeat strategy. The two designs differ at every layer: recurrence model, next-occurrence engine, storage, trigger delivery, and execution tracking.
- **The layer worth sharing first is the recurrence engine**: a schedule definition plus "next occurrence after T in timezone Z". It is pure logic with no infrastructure dependency, and it is where both services carry the hardest code (DST, timezone conversion, start boundaries) and the most tests.
- **The definition is RFC 5545 rather than a model of our own.** Both products' capabilities were read off the code and mapped part by part: everything maestro and CTENG express needs six of RRULE's fourteen rule parts (`FREQ`, `INTERVAL`, `BYDAY`, `BYHOUR`, `BYMINUTE`, `BYMONTHDAY`), none of the hard ones, and CTENG's 1-to-4 times per day are a recurrence set of up to four rules. So RRULE is the lingua franca, narrowed by a published profile, with a codec in core: the forward half already exists in maestro (~90 lines) and needs about 50 more for CTENG's `times[]` and weekday numbering, and the reverse half is one bounded decision tree (~150 lines) guaranteed by a `decode(encode(form))` property test. Each product keeps its own form schema as its API contract; what changes is only what the library stores and computes on.
- **Trigger delivery goes behind one adapter interface, with pg-boss and BullMQ as equally supported implementations.** This document does not pick a winner between them, and neither does the library: which backend a service runs is a service-level choice until there is a broader org architectural decision on which paths are supported and officially recommended. What the analysis records as input to that decision is the durability difference. Redis persistence is best-effort (an RDB snapshot loses everything since the last dump, AOF with `everysec` still loses up to a second, and a failover to a replica can lose acknowledged writes), while Postgres commits are synchronously durable and covered by the same backup, point-in-time recovery and replication guarantees as the rest of the service's data, and pg-boss can register or cancel a schedule in the same transaction as the service's own write. Against that, BullMQ fires with lower latency, is already in production in maestro, and is the queue `background-jobs-common` supports today, so a service on BullMQ adds no infrastructure to adopt the library. Neither adapter owns a schedule table: the service's domain table stays the canonical registry, and the pending job or job scheduler is the runtime record.
- **pg-boss's `schedule()` is cron-only today, and the fix is already written.** [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886) adds pluggable recurrence kinds in 12.30.0: parsers are registered on the instance the way `work()` handlers are, `next_run_at` and `last_run_at` move onto the schedule row, and the missed-occurrence policy becomes an option. The plan assumes it is adopted, which makes the adapter a direct mapping onto `boss.schedule`, `boss.unschedule` and `boss.getSchedules`, with the schedule row as the runtime registry. If the adapter is due before that release, it ships the same public surface over a self-perpetuating chain of deferred jobs and switches internally later: no caller change and no migration of running schedules, given three rules held from the first commit (no backend identifier crosses the facade, the option surface is one both strategies honour, one mechanism per key). Existing series convert on their next fire, write or reconcile. The plan therefore builds the pg-boss adapter last, when the release state is known.
- **Showing the end user the current recurrence, and letting them change it, is a first-class requirement.** The canonical rule the user's form encoded to is what the library stores on the backend (a schedule row, a job payload or scheduler template data) and hands back on read, together with the next fire time, and `decode` turns it into that product's form again. Change is recreation (`reschedule`), which pg-boss makes a single `upsert` statement.
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

A `ScheduleDefinition` that is canonical RFC 5545 text (`DTSTART;TZID` plus one to four `RRULE`s, in a fixed part order), one codec per product form, and one function:

```ts
type ScheduleDefinition = string & { readonly brand: unique symbol }

nextOccurrence(definition: ScheduleDefinition, { after: Date, startAt?: Date }): Date | undefined

// bound to one product's form schema
codec<Form>(schema: ZodType<Form>): {
  encode(form: Form): ScheduleDefinition        // total, canonical
  decode(definition: ScheduleDefinition): Form | 'custom'
}
```

The canonical text is the only representation that gets stored, transported or read back. Nothing re-encodes it: adapters pass the string through, `nextOccurrence` parses it, and the `RRuleSet` lives inside the engine as a parse artefact. `encode` is the only thing that mints a `ScheduleDefinition`, and because a codec is bound to one form schema (maestro's `RRULE_CONFIGURATION_SCHEMA`, CTENG's `frequency`/`days`/`times`), `decode` cannot hand a caller the other product's shape.

What the codec has to cover: frequency, interval, weekday set, explicit time pairs, hour window (for maestro minutely and hourly), month-day position, IANA timezone, start boundary. All of it maps onto six RRULE parts, worked through in "Engine and model: trade-offs" below. Output of `nextOccurrence` is a UTC `Date`.

Why this is the right first cut:

- Pure, synchronous, no I/O. Trivially testable, and the existing maestro test corpus (633 lines in `rruleUtils.spec.ts`, 219 in `rruleRepeatStrategy.spec.ts`) moves with it.
- Both services carry timezone and DST risk here. One implementation with both services' fixtures is stronger than two.
- CTENG can adopt it by making `computeNextRunAt` a thin wrapper, with zero change to storage or runner. That is a safe first consumer.

Two design decisions sit inside this layer and deserve a full treatment: which library computes occurrences, and what the canonical definition model is. They are related but separable, and the section "Engine and model: trade-offs" below works through both.

#### Engine and model: trade-offs

**Decision 1: what computes the next occurrence**

Candidates, with the facts that matter:

| Candidate | What it is | Timezone and DST handling | Dependency footprint | Production evidence here |
| --- | --- | --- | --- | --- |
| `rrule-rust` 3.1.1 | N-API binding to the Rust `rrule` crate. Full RFC 5545 recurrence: `RRuleSet`, `EXRULE`, `RDATE`, `EXDATE`, `WKST`, `BYSETPOS`, month-end (`BYMONTHDAY=-1`). | Native `DTSTART;TZID=` support, computed in Rust with the crate's own tz database. Maestro still wraps it with a UTC shift and a one-hour DST bump in `getNextOccurrence`, which suggests the wrapping code, not the library, is where the doubt lives. | Prebuilt binaries as optional platform packages (14 targets, including `linux-x64-musl`, `linux-arm64-gnu`, `wasm32-wasi` as a fallback). No compile step on install. Maestro's Dockerfile has no special handling and runs it in production. Adds ~14 lockfile entries and a binary per image. | Maestro, all scheduled workflows, since the RRULE migration. |
| `rrule` 2.8.1 (pure JS) | The long-standing JS port of python-dateutil's rrule. `tslib` only. | Weak by design: computes in "floating" time and expects the caller to convert. `TZID` support has been partial and bug-prone across versions; DST transition results depend on the host timezone unless carefully wrapped. This is the reason maestro chose `rrule-rust` in the first place. | Zero native code. | None. |
| `rrule-temporal` 2.2.2 (pure JS) | RRULE on top of the `Temporal` API (`temporal-spec`). Correct zoned arithmetic falls out of `Temporal.ZonedDateTime`. | Strong: DST and calendar math are Temporal's job. | Requires `Temporal` at runtime. Node 24 does not ship it unflagged, so a polyfill (`@js-temporal/polyfill`, several hundred KB, slow first load) is needed until the runtime catches up. Young project, small user base. | None. |
| Own Intl-based arithmetic (CTENG's `computeNextRunAt`, extended) | Hand-written candidate enumeration using `Intl.DateTimeFormat` to resolve local wall time to UTC, including the spring-forward gap rule. | Correct for what it covers, and CTENG runs it in production. Correctness for new features (monthly `last`, `INTERVAL` across weeks, `WKST`) has to be built and tested by us. | Zero dependencies. | CTENG, all schedules. |

Trade-offs, beyond the table:

- **Correctness risk concentrates in DST edges and calendar arithmetic**, and both are solved problems in mature RRULE implementations. Writing them again is the highest-risk option even though it looks like the cleanest. CTENG's implementation is roughly 300 lines for three frequencies with no intervals; maestro's model adds minutely windows, hourly windows, `repeatEvery`, and month-day positions. Covering that in hand-written code and proving it over DST transitions in every customer timezone is a real project, not a port.
- **The native binary cost is real but already paid once.** Every consumer's CI and Docker image gains a platform binary and the lockfile gains the platform matrix. The failure modes are known (a missing target, a musl/glibc mismatch, a pnpm `supportedArchitectures` misconfiguration) and they fail loudly at install time, not at 3 a.m. CTENG on `linux-x64` is a covered target. The `wasm32-wasi` fallback also covers unexpected targets at a performance cost.
- **Every backend wants a string, so the engine needs a parser either way.** BullMQ's `repeatStrategy` receives `opts.pattern` and parses it on every fire; the pg-boss chain carries the rule in the job payload; #886's `expression` is a string handed to a registered parser. `rrule-rust` parses and serialises RFC 5545 already. A hand-written engine would mean writing an RFC 5545 parser as well, or smuggling JSON through fields that other tooling reads as a recurrence.
- **pg-boss Proposal 1 makes the engine a registered parser.** The parser runs on every instance with `schedule: true`, so its dependency footprint lands on every service that runs the timekeeper. That argues for keeping the footprint modest, but it does not disqualify a prebuilt native module.
- **Lock-in is controllable.** The public API is a definition in and a `Date` out, and the definition is RFC 5545 text rather than anything of our own, so the engine behind it can be swapped without touching consumers or stored rules. The tests are the asset: build the fixture corpus (both services' existing tests, plus a generated sweep of a year of occurrences per timezone) so that a future swap to `rrule-temporal` when Temporal ships unflagged is a green-suite exercise.

Recommendation for decision 1: **`rrule-rust` behind a library-agnostic API**, with the fixture corpus as the swap guarantee. Revisit when Node ships Temporal unflagged and `rrule-temporal` has a year of production use somewhere. Do not write our own calendar arithmetic.

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
| Rules per set | one | up to four, one per distinct time | 1 to 4 |
| `DTSTART;TZID` | always, IANA zone | `startAt` plus `timezone` | required |
| `WKST` | fixed `MO` | not applicable | fixed `MO` |
| `COUNT`, `UNTIL` | not in stored rules (`UNTIL` only inside the next-occurrence call) | not used | excluded |
| `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, `BYMONTH`, `RDATE`, `EXDATE`, `EXRULE` | not used | not used | excluded |

Six of RFC 5545's fourteen rule parts, and none of the awkward ones: no `BYSETPOS`, no ordinal `BYDAY` ("second Tuesday"), no week-number arithmetic. Everything CTENG expresses today, including its 1-to-4 `times[]` and its `startAt` boundary, lands inside the profile, and so does everything maestro expresses. RFC 5545 is a superset of both, with room for what either product will plausibly ask for next: last weekday of the month, "every second Friday", an end date.

Two places where the mapping is not literal:

- **Multiple times of day need a recurrence set.** `times: [09:15, 17:45]` cannot be one `RRULE`, because `BYHOUR=9,17;BYMINUTE=15,45` is the cross product of four times. RFC 5545's own answer is a set: one `RRULE` per distinct time (or per group of times sharing a minute), which `rrule-rust`'s `RRuleSet` takes as an array and unions when iterating. Limit: RFC 5545 says `RRULE` SHOULD NOT appear more than once in a component, so while every RRULE library handles a multi-rule set, strict third-party calendar interop on that shape is not guaranteed. If that ever matters, the alternative is one component per time.
- **CTENG's hourly minute is a local minute.** `FREQ=HOURLY;BYMINUTE=M` with a `TZID` carries the same semantics, including in zones with 30 or 45 minute offsets, which its `computeNextHourlyRunAt` searches for by hand today.

**How easy is the translator?**

Forward, product form to RRULE, is already written and small. Maestro's `translateFilters` is roughly 90 lines of branches and emits five of the six parts for all five frequencies. CTENG adds two things: `times[]` to one rule per time, and its `days: 1..7` to `BYDAY` through a seven-entry map (its numbering is ISO, so it lines up with `MO` to `SU` in order). Call it under 50 lines on top of what exists, plus fixtures. It is a total function: every in-profile form has exactly one encoding.

Backward, RRULE to product form, is the new work and the half that the UI requirement actually depends on. It is tractable for the same reason the forward direction is: the profile is small and closed. Read `FREQ`, `INTERVAL`, `BYDAY`, `BYHOUR`, `BYMINUTE`, `BYMONTHDAY`; group sibling rules by `(FREQ, INTERVAL, BYDAY)` to recover `times[]`; return the form. Anything outside the profile decodes to `custom`, which the UI renders read-only and each product's write path rejects, which is how calendar UIs have always handled rules their form cannot express. Estimate 100 to 150 lines, and the guarantee is a property test over the fixture corpus: `decode(encode(form))` is the identity for every fixture, and `encode` is canonical (fixed part order, sorted `BYDAY`, `BYHOUR`, `BYMINUTE`) so equality is a string compare again.

Two traps the profile has to encode, both found in the existing code:

- **`BYMINUTE` filters rather than expands under `FREQ=MINUTELY`**, which is what maestro's `MINUTELY_END_OF_DAY_TIME` comment is about: a half-hour window boundary can produce a rule that never fires. The profile forbids that combination and expresses windows as `BYHOUR` plus `INTERVAL` on whole-hour boundaries, keeping the 23:59 sentinel handling in the encoder.
- **`monthDayPosition: 'current'` currently compiles to `byMonthday: [new Date().getUTCDate()]`**, the day the compile happens to run on. Recompiling on a different date silently moves the schedule, and 29 to 31 skip short months. Making the encoding canonical forces this into the open: take the day from `DTSTART` and constrain it to 1 to 28 or `-1`. Rules that already store 29 to 31 are left alone rather than rewritten: `decode` still reads them, the profile validator marks them out of profile so the form renders read-only, and a one-off audit lists the affected workflows for their owners to re-pick between a fixed day and `-1`. Normalising them silently is the one thing to avoid, because "the 31st" and "month end" are different intents and the compile date does not record which was meant. February in a leap and a non-leap year is a fixture, for 29, 30, 31 and `-1`. Worth fixing in maestro independently of this work.

What adopting the standard does not buy: RFC 5545 says nothing about what a rule means at a DST gap or a repeated hour, so the engine still owns that policy and the fixture corpus still has to pin it. Maestro's one-hour bump and CTENG's shift-forward-into-the-gap rule have to be reconciled either way.

**The two options, with the profile in hand**

Option A: **RRULE is the model, narrowed by a published profile.** `ScheduleDefinition` is canonical RFC 5545 text (`DTSTART;TZID` plus one to four `RRULE`s). Core ships `encode(form)`, `decode(text)` and a profile validator; product forms stay in each product's API contract.

Option B: **A product-neutral native model.** A zod schema with `frequency`, `interval`, `weekdays`, `times: {hour, minute}[]`, `hourWindow`, `monthDayPosition`, `timezone`, `startAt`. The engine consumes it directly, and RRULE text is produced only where a backend needs a string.

| Concern | A: RRULE plus a profile | B: native model, RRULE as an export |
| --- | --- | --- |
| Expressiveness | Anything RFC 5545 allows, narrowed to the profile. Growing it is an edit to a validator, and the ceiling is the standard's, not ours. | Exactly what the products need today. Every new capability is a schema change plus engine support, and the ceiling is whatever we thought of. |
| Round trip to the UI | Deterministic inside the profile: `decode(encode(form))` is the identity over the fixture corpus, and out-of-profile text decodes to `custom` for read-only display. Costs a decoder, roughly 150 lines and its tests. | Lossless by construction, no decoder needed. |
| Time pairs | An `RRuleSet` with one rule per time, the standard's own encoding for this. Longer string, and `RRULE` more than once in a component is discouraged by the spec. | `times[]` is a field. |
| Whole-hour minutely windows | The `BYMINUTE`-under-`MINUTELY` trap becomes a profile rule, enforced by the validator and visible in the fixtures. | The trap stays inside the library behind `hourWindow`. |
| Validation | Profile validator, plus per-product refinements (maestro's 15-minute floor stays in maestro). | Zod schema plus the same per-product refinements. |
| Equality and change detection | String compare, made exact by canonical serialisation rather than brittle as maestro's current compare is. | Structural compare on normalised fields. |
| Adapters | One string for all transports: BullMQ's `pattern`, the pg-boss chain payload, and #886's `expression`. | Every transport needs the encoder anyway, so the same string exists, just derived. |
| Migration of stored data | Maestro's `triggerSchedulerExpression` already is RRULE text, no transform. CTENG keeps its columns and encodes on write. | Maestro maps its layout fields; CTENG maps field for field. Neither migrates storage. |
| Interop | A standard others can read: calendars, other teams, future tooling. The profile narrows what we emit and is published with the package. | Proprietary. Exportable, but every consumer outside our code has to be handed a converter. |
| Cost of being wrong | If the profile turns out too narrow, widen the validator. | If the model turns out too narrow, change the schema, the engine, both products' contracts and the stored rows. |

Recommendation for decision 2: **Option A, RRULE as the lingua franca**, with a published profile, a canonical encoder, a decoder that returns `custom` outside the profile, and the round-trip property test as the guarantee. The round-trip argument is what favours Option B, and the numbers undercut it: the subset in play is six rule parts, the decoder is one bounded decision tree over them, and RFC 5545 covers everything both products do today with room left over. Inventing a schema to avoid 150 lines of decoder means owning a ceiling forever.

What stays product-owned: CTENG's `frequency`/`days`/`times` REST contract and maestro's `RRULE_CONFIGURATION_SCHEMA` frontend contract. Neither changes. The library's job is the codec between those forms and the canonical rule, so a form remains what the UI edits and RRULE remains what the system stores, computes on and hands to a backend.

**How the two decisions combine**

RRULE in, `rrule-rust` computing, the same string on every transport. The engine is form to `RRuleSet` through the shared encoder (maestro's compiler, extended with `times[]`), then `rrule-rust` for iteration, wrapped in a timezone-safe `nextOccurrence`.

**The codec belongs in core, not in an adapter.** RRULE text is not a BullMQ artefact: BullMQ's `pattern`, the pg-boss chain's job payload and #886's `expression` all carry the same string, and both products need the encoder to write a schedule and the decoder to render one. So core owns `encode`, `decode`, the profile validator and `nextOccurrence`, while an adapter only decides where the string travels and how the next fire is triggered. Nothing about the model differs per backend, which is part of what keeps the two adapters swappable.

When Temporal is generally available, the iteration step can move to a pure-JS engine behind the same fixture corpus, with no change to the stored rules.

### Layer 2: trigger delivery (share, behind an adapter)

The library does **not** own a durable schedule registry. Both services already keep the user's structured configuration in their own tables (maestro in the workflow layout, CTENG on the `schedule` row), and that remains the canonical record. The delivery adapter's job is to make the next occurrence fire and to answer "when does this fire next". Interface:

```ts
type ScheduledJob = {
  id: string                       // stable per schedule, e.g. workflowId or scheduleId
  owner: string                    // tenant or team key, stored where each backend can filter on it
  definition: ScheduleDefinition   // canonical RRULE; decode() renders it back to a product form
  payload: unknown                 // what the service needs at fire time
  catchUp: 'skip' | 'once' | 'all' // per-backend semantics in the table below
  nextRunAt: Date | undefined
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

A `Scheduler` facade composes the engine and one adapter and adds `previewOccurrences(definition, { from, count })`, `reconcile(desired: ScheduledJob[])` and a fire-delay metric. `reconcile` reads the backend through `list`, which is why `list` is bounded and cursored and returns live schedules only: a diff that pulls a busy key's history is both wrong and unbounded.

**Delivery is at-least-once, and `onFire` is not a transaction.** Every backend can deliver one occurrence twice: a handler that throws is retried, and so is a handler that finished its work but failed before acknowledging. `ctx.fireId` is identical on every delivery of the same occurrence, so it is what a handler writes its own idempotency row against; the library does not dedupe domain work on its behalf. `ctx.db` is pg-boss only, and it covers the handler's own writes: domain rows and any job the handler enqueues commit together. Completing the fired job in that same transaction needs the upstream `work({ transactional: true })` ask in "Smaller upstream follow-ups", so until it lands a fire is at-least-once on pg-boss too, and `fireId` rather than a transaction is what handlers rely on. `onDispatchFailed` runs when a delivery exhausts its retries, which is where a service marks the occurrence failed in its own tracking.

#### pg-boss adapter

**What it gives**

- **Durability.** A lost schedule means a revenue-generating workflow silently stops running, which is CUJ-002's failure mode. Redis persistence is best-effort by design: RDB snapshots lose everything since the last dump, AOF at the default `everysec` loses up to a second of acknowledged writes, and a failover promotes a replica that may be behind. Postgres commits are synchronously durable.
- **One backup story.** The schedule sits in the database that already has backups, point-in-time recovery, replication and monitoring, so there is one thing to restore rather than two.
- **Transactional writes.** Registering, rescheduling and unscheduling commit in the same transaction as the domain row they belong to, so a saved schedule and a registered schedule cannot diverge.

**What it costs**

- A new dependency and a `pgboss` schema for any service that does not already run it.
- Fire precision bounded by the poll interval rather than Redis latency. Not the deciding factor for schedules that fire minutes to months apart, but real.
- Before 12.30.0, the chain described under "If 12.30.0 is not released when the adapter is due".

**How it works**

1. `schedule(job)` passes the definition through as the expression: `boss.schedule(queue, { kind: 'rrule', expression: job.definition }, { owner, payload }, { key: id, missed })`. `owner` sits at the top level of the schedule data so `list` can filter on it.
2. pg-boss maintains `next_run_at` on the schedule row and forwards a job to the queue at each occurrence; the worker handler invokes `onFire`.
3. `reschedule(job)` is the same call again, an upsert on `(name, key)`. `unschedule(id)` is `boss.unschedule(queue, id)`. `get(id)` is `boss.getSchedules(queue, id)`.
4. Every write takes `{ db: fromDrizzle(tx, sql) }`, so `schedule`, `reschedule` and `unschedule` join the caller's transaction, as does anything the fire handler enqueues. Both drizzle drivers in use are covered (postgres-js in maestro, node-postgres in CTENG).

No daily DST recompute is needed: every occurrence is computed from the rule in the timezone it carries. Retention is anchored to `start_after`, so month-ahead occurrences survive until they fire. Fixed housekeeping jobs (maestro's `detect_stuck_workflow_runs` and `tasks_about_to_expire`, CTENG's cleanup jobs) use native cron with `{ kind: 'cron' }`.

`reconcile(desired)` ships in the first release. Each service feeds it from "Live scheduled workflows" or "enabled schedules" on a periodic job, and the library diffs against what the backend holds, then sends or cancels. It is what closes CUJ-002's silent-missing-schedule failure mode, which has no equivalent today, and it is mandatory rather than merely useful on the chain, where a series can die with a handler.

#### BullMQ adapter

Wraps BullMQ job schedulers as maestro does today, with the engine's `nextOccurrence` supplied as `repeatStrategy`. Maestro adopts the library through it and deletes its three hand-rolled `QueueManager` subclasses without changing what fires when. It is supported on the same terms as the pg-boss adapter, with no deprecation.

- `get()` returns the structured definition and the next fire time, the same as the pg-boss adapter, by carrying the definition in the job scheduler's template data. Confirmed against the bullmq 6 job-scheduler API that `background-jobs-common` develops against: `getScheduler(key)` returns `template.data` alongside `next`, `pattern` and `tz`. This requires `upsertJobScheduler`, not the legacy repeatable path, which stores the pattern only.
- The pattern-compare-then-remove logic for edits moves into the adapter so the dedup edge case is handled once.
- Redis is the firing source of truth here, so `reconcile` matters more on this adapter than on pg-boss, where the pending row is covered by the service's own backups. It ships in the first release for both.
- No transactional writes: registering a schedule cannot be committed with the domain row it belongs to, and neither can anything the fire handler enqueues, so `ctx.db` is absent here. That is inherent to Redis plus Postgres, so it belongs in the capability matrix rather than in the adapter's backlog.
- Housekeeping cron schedules stay on BullMQ's own repeat handling, matching what pg-boss's native `schedule()` does on the other side.

#### Keeping the two adapters interchangeable

Two equally supported backends stay equal only if the library enforces it:

- **One conformance suite, run against every backend.** The same test file, parameterised over adapters (Redis container, Postgres container), covering register, reschedule, unschedule, read, list, missed occurrences, DST boundaries and reconcile. This is the mechanism that keeps "adopting the library does not commit you to a backend" true.
- **The facade never leaks a backend identifier.** No pg-boss job id, no BullMQ scheduler key, in any return type. Callers key on their own schedule id.
- **The option surface is what both adapters can honour.** An option only one backend can implement goes in the capability matrix and is rejected at call time by the other, rather than silently behaving differently. `catchUp` is the one that has to be written down, because each backend has an accidental answer today:

  | `catchUp` | pg-boss native | pg-boss chain | BullMQ |
  | --- | --- | --- | --- |
  | `skip` | `missed: 'skip'` | the handler still chains the successor, and skips `onFire` when the occurrence is older than one poll interval | the adapter skips `onFire` on the same rule; the scheduler keeps running |
  | `once` | `missed: 'once'` | the overdue job fires, and the successor is computed from now | the scheduler's own behaviour: one overdue occurrence fires on resume |
  | `all` | `missed: 'all'`, capped at 1000 | the engine enumerates the missed occurrences, capped at 1000, each sent under `${id}#catchup:${iso}` so a retry cannot duplicate one | rejected at call time |

  Replayed occurrences are sent in ascending order, and each carries its own `fireId` and `firedAt`. Delivery order is not guaranteed once more than one worker is running, so a handler that cares about sequence orders on `firedAt`. `all` is a pg-boss-only matrix row, honoured by both of its strategies, which is what keeps the strategy switch in the next section invisible to callers.
- **Capability matrix, published with the package.** Transactional writes and `catchUp: 'all'` are pg-boss only. Sub-second precision, batching semantics, retention and what the read path returns are all matrix rows, filled from the conformance suite rather than from prose.
- **Backend-specific constraints stay inside their adapter.** The 24-hour cap on `active` time is pg-boss's, so "enqueue domain work rather than running it inline" is guidance in that adapter's docs, and core imposes it on nobody.

### Showing and changing the recurrence for the end user

This is an explicit requirement, covered as follows.

**Today**

- Maestro keeps the structured configuration in the workflow layout's `TriggerStep` settings. The UI reads from there; BullMQ only sees the compiled string. Change goes through `UpdateLiveWorkflowUseCase`: save the layout, compile, compare with the stored scheduler pattern, remove if different, re-add.
- CTENG stores the structured fields on the `schedule` row and returns them through `GET /v1/schedules`. Change is an upsert that recomputes `next_run_at`.

Both services already treat the structured definition as canonical and the runtime artefact as derived. The library preserves that.

**What the library guarantees**

- `ScheduledJob.definition` is the canonical RRULE the caller passed in (or that `encode(form)` produced from their form). pg-boss carries it in the job payload or as #886's `expression`, BullMQ in the scheduler template data and as `pattern`. It is the same string on every transport, so the read path returns the same thing regardless of backend, and `decode` turns it back into a form for rendering.
- `scheduler.get(id)` returns definition plus `nextRunAt`, so a UI can render "every weekday at 09:00 Europe/Berlin, next run 2026-09-03 07:00 UTC" from one call. Both adapters answer it: pg-boss from the job payload or schedule row, BullMQ from the job scheduler's template data and `next`.
- `scheduler.previewOccurrences(definition, { from, count })` runs the engine only, so a form can show the next few runs before saving.
- `scheduler.reschedule(job)` is the change path. On pg-boss it is one `upsert` by `singletonKey`; on BullMQ it is compare, remove, re-add.
- Human-readable rendering (CTENG's `formatScheduleLocalTime`, maestro's form labels) stays in each product because it needs localisation. The library may ship `describe(definition)` for logs and admin tooling.

**Where the definition lives per adapter**

| Adapter | Where `definition` is readable | Notes |
| --- | --- | --- |
| pg-boss | Schedule row `expression` natively, pending job payload on the chain | Meets the requirement on its own. Products keep their own row for listing and history. |
| BullMQ | Job scheduler template data, via `getScheduler(key)` | Requires `upsertJobScheduler` rather than the legacy repeatable path. Products keep their own row for listing and history. |

`list` on pg-boss matches the top-level `owner` key in the schedule data (`getSchedules` natively, `findJobs({ data: { owner } })` on the chain) and pages under the caller's `limit`. It is adequate for admin tooling; customer-facing lists come from the product tables.

### Layer 3: execution tracking and domain dispatch (do not share)

CTENG's `schedule_execution` model (conflict keys, queued drains, Autopilot correlation, TTL recovery) and maestro's `RunWorkflowJob` (start a workflow run, entitlement checks, delay histograms) are domain code. The library exposes `onFire` and `onDispatchFailed` and leaves the rest to the service.

## pg-boss: the primitives the adapter uses

Checked against 12.29.0 and [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886). Only what shapes the design is listed.

| Primitive | What the adapter does with it |
| --- | --- |
| `schedule(name, { kind, expression }, data, { key, missed })` with a registered `rrule` parser (12.30.0) | The registry itself: one row per schedule keyed `(name, key)`, re-callable as an upsert, `next_run_at` maintained by pg-boss. |
| `getSchedules(name, key)` reporting `kind`, `expression`, `nextRunAt`, `lastRunAt` (12.30.0) | `get()` and `list()` as a straight read. |
| `missed` policy on `schedule()` (12.30.0) | `catchUp` maps onto it directly. |
| `send(name, data, { startAfter, singletonKey })` on a `short` queue | The bridge if 12.30.0 is not out yet: one pending occurrence per key, unlimited concurrent actives, a duplicate send resolving `null` instead of throwing. |
| `upsert`, `findJobs(name, { key, queued: true })`, `cancel` | Reschedule in one statement, read the pending occurrence, stop a series. |
| `{ db: fromDrizzle(tx, sql) }` on every write | Registering or cancelling a schedule commits with the service's domain write. Covers both drizzle drivers in use: postgres-js in maestro, node-postgres in CTENG. |
| `keep_until = start_after + retentionSeconds` | A month-ahead occurrence is not garbage-collected before it fires. |

Two constraints to design around:

- `expireInSeconds` caps `active` time at 24 hours, so the fire handler enqueues domain work instead of running it inline.
- `useListenNotify` needs a session-pinned connection and does not work through PgBouncer in transaction mode. Accept poll-interval precision, or give pg-boss a direct connection.

## Upstream: native recurrence lands in 12.30.0

In 12.29.0 `schedule()` takes a cron string and nothing else: the timekeeper evaluates `cron-parser`'s `prev()` against database time every 30 seconds, sends when `prevDiff < 60`, and deduplicates across instances with `singletonSeconds: 60`. There is no hook for another expression language, and that throttle also caps a schedule at one job a minute.

The change that fixes it is written and open as [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886) (19 files, migration v40, tests and docs). **This document plans on it being adopted.**

What it changes upstream:

- Recurrence parsers are registered on the instance, the way `work()` handlers are, so our engine plugs in and pg-boss takes on no RRULE dependency. A plain string stays `{ kind: 'cron' }`, the one built-in kind.
- `kind`, `next_run_at` and `last_run_at` join the `schedule` row. Each pass claims the due rows in one statement, so dedup across instances is the row claim rather than `singletonSeconds: 60`, which also lifts the minute floor.
- `missed: 'skip' | 'once' | 'all'` becomes explicit on `schedule()`, with `all` capped at 1000 occurrences per schedule.
- `getSchedules()` reports `kind`, `expression`, `nextRunAt` and `lastRunAt`.

What the adapter becomes on top of it: `schedule` and `reschedule` are `boss.schedule`, `unschedule` is `boss.unschedule`, `get` is `boss.getSchedules`. The schedule row is the registry, so there is no chain, no `singletonKey` bookkeeping and no payload scraping, and `reconcile` narrows to a consistency check against the service's own table. Ours to keep: the recurrence engine, registered as the `rrule` parser, and `previewOccurrences`.

### If 12.30.0 is not released when the adapter is due

The adapter ships the same public surface over a self-perpetuating chain of deferred jobs, then switches to native recurrence internally:

1. `schedule(job)` computes the first occurrence and calls `send(queue, { id, definition, payload }, { startAfter: fireAt, singletonKey: id })`.
2. The handler computes the next occurrence from the definition in the job data, sends the successor with the same `singletonKey`, then invokes `onFire`. Under the `short` policy at most one job per key sits in `created`, so a retried handler cannot double-book the series. It can repeat the fire, though: the successor send has already committed when `onFire` runs, so a handler that fails after that point is retried against a successor that exists. `ctx.fireId` is what stops the domain work happening twice, and the window is a test case rather than a caveat.
3. `reschedule` is `upsert` by `singletonKey`; `unschedule` is `findJobs` then `cancel`; `get` reads the pending job's `data.definition` and `startAfter`.
4. `reconcile` is mandatory here rather than merely useful: if a handler exhausts its retries before sending the successor, the series dies silently and only the domain table can recover it.

Switching later costs no caller change and no migration of running schedules, provided three rules hold from the first commit:

1. **No backend identifier crosses the facade.** A schedule's identity is a pending job id on the chain and a `(name, key)` row natively. Neither may reach a domain column, a log line or a dashboard query.
2. **The option surface is what both strategies honour in full.** Both honour all three `catchUp` values, per the table in "Keeping the two adapters interchangeable", so no caller sees a default change when the strategy flips. Shipping `once` only and adding `skip` and `all` with the native path would change behaviour under callers who took the default.
3. **One mechanism per key, enforced by the adapter.** A pending chain job lives in `pgboss.job` and a native schedule in `pgboss.schedule`, so nothing in the database stops a key existing in both, and a key in both fires twice. `reconcile` is where the check belongs.

Existing series convert themselves, in one transaction per key:

- **On fire.** The handler writes the schedule row instead of sending a successor, in the transaction that completes the fired job.
- **On write.** Any `schedule` or `reschedule` cancels the pending chain job and inserts the schedule row.
- **On reconcile.** The periodic pass converts the remainder, which is what forces the tail instead of waiting a year for an annual schedule.

A job already `active` at conversion time fires once more on the chain and converts on completion. What needs a deadline is the code, not the jobs: a chain series has no natural end, so only `UNTIL` and `COUNT` definitions drain by themselves. Run the adapter suite twice, once per strategy, the way step 2 runs both engine implementations side by side.

The version gate is deployment-wide, not per-process:

- Migration v40 ships in 12.30.0 with a rollback plan.
- 12.29.0's `contractor.start()` migrates only when the library's schema version is ahead of the stored one, so an older pg-boss against a v40 schema runs rather than erroring.
- 12.29.0's cron pass catches a per-row expression failure, warns `INVALID_SCHEDULE` and skips the row, so an `rrule` row in front of an old instance is skipped rather than fatal. [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886) does the same for a kind it has no parser for (`unsupported_recurrence`).
- For `cron` rows, [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886) keeps `singletonSeconds: 60` with an occurrence-aligned `singletonOffset`, so an old instance and a new one forwarding the same occurrence collide on one slot during a rolling upgrade.

A natively registered schedule fires only while at least one upgraded instance runs the timekeeper, so flip the strategy by config once the dependency bump has rolled out everywhere, and treat capability detection as an assertion.

### Smaller upstream follow-ups

Independent of [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886), each useful on its own:

- `getSchedule(name, key)`, `previewSchedule(kind, expression, tz, { from, count })` and `lastJobId`, which make `get()` and `previewOccurrences` one call each.
- `work(name, { transactional: true }, (job, tx) => ...)`. Today, running fetch, side effects and `complete` in one transaction means bypassing `work()` and reimplementing its polling, batching, heartbeats and error handling.
- `findJobs` filters: `states`, `limit`, `orderBy`, a cursor, and a `getJobByKey(name, key)`. `list()` promises live schedules only, bounded and cursored; without these the chain adapter has to filter and page in memory over whatever `findJobs` hands back.
- Docs: `keep_until` anchoring to `start_after`; which job states each queue policy's `singletonKey` index covers; the cron scheduler's missed-slot behaviour.

### How this shapes the plan

- The pg-boss adapter is built last (step 5 of the migration outline). By then 12.30.0 is the likely target and the chain may never be written.
- Native recurrence is an internal strategy of the one pg-boss adapter, never a second adapter, gated on the whole deployment running 12.30.0 or newer.
- Nothing in steps 1 to 4 depends on the review: they are the engine, the codec, the facade and the BullMQ adapter.

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

- `@lokalise/scheduling-common` (core): the RRULE profile and its validator, `encode` and `decode` for both products' forms, `nextOccurrence`, `DeliveryAdapter` interface, `Scheduler` facade with `previewOccurrences` and `reconcile`, fire-delay metric helper. The codec lives here rather than in an adapter, because every backend carries the same RRULE string.
- `@lokalise/scheduling-common/pg-boss`: chain adapter, queue setup (`short` policy), worker registration, transactional send helper. `pg-boss` as an optional peer dependency.
- `@lokalise/scheduling-common/bullmq`: job-scheduler adapter, supported on equal terms with the pg-boss entry point. `bullmq` as an optional peer dependency.

Dependencies of core: `zod`, the RRULE engine (initially `rrule-rust`), `cron-parser` for legacy cron patterns. No dependency on `background-jobs-common`, `ioredis`, `bullmq` or `pg-boss` in core. The conformance suite runs against both entry points, so the package's docker-compose needs a Postgres container alongside the Redis one `background-jobs-common` already uses.

## Migration outline

1. **Engine package.** Move `rruleUtils.ts` and `rruleRepeatStrategy.ts` (minus the metric coupling) into the new package as the encoder and the iteration wrapper. Publish the profile and its validator, extend the encoder with explicit time pairs and CTENG's weekday numbering, and add the decoder with the `decode(encode(form))` property test over both services' fixtures. Maestro adopts by import swap; `maestro-common` keeps `RRULE_CONFIGURATION_SCHEMA` as its frontend contract, now one of the codec's input forms.
2. **CTENG adopts the engine.** `computeNextRunAt` delegates to `nextOccurrence`. Storage and runner unchanged. Run both implementations side by side in tests over a year of dates in the timezones CTENG customers use, then delete the local implementation.
3. **Facade and BullMQ adapter.** Build the `Scheduler` facade, the `DeliveryAdapter` interface and `reconcile`, then the BullMQ adapter as a thin wrapper carrying maestro's pattern-compare-then-remove logic. No pg-boss yet. Settle the `catchUp` option set here, since it is what keeps the later pg-boss strategy switch invisible.
4. **Maestro on the BullMQ adapter.** Replace `RunWorkflowJobScheduler`, `DetectStuckWorkflowRunsJobScheduler` and `TasksAboutToExpireJobScheduler` with facade calls. Add the periodic `reconcile` fed from Live scheduled workflows. The CLI script switches to `scheduler.list()`. No runtime behaviour change; CUJ-002's missing-scheduler failure mode gains a recovery path.
5. **pg-boss adapter, strategy decided on arrival.** Native strategy only if [timgit/pg-boss#886](https://github.com/timgit/pg-boss/pull/886) is released by then; otherwise the chain under the three rules in "If 12.30.0 is not released when the adapter is due", plus the conversion path and its end date. Full test suite either way (`upsert` reschedule, retention, transactional send, reconcile), run once per strategy the release contains. The conformance suite starts running against both adapters here. The remaining upstream proposals get filed alongside.
6. **CTENG on the facade.** Replace `ScheduleRunnerJobProcessor` and `ScheduleNextRunRecomputeJobProcessor` with the facade: on save, `schedule` or `reschedule`; the `onFire` handler runs today's `executeScheduleInTransaction` logic and `schedule_execution` tracking unchanged. `next_run_at` becomes a cached display value populated from `get()`, or is dropped. Fire precision improves from tick granularity to per-occurrence. On the pg-boss adapter, since CTENG runs no Redis for this and the schedule stays in the database it already backs up; that is CTENG's call to make, and the BullMQ adapter would work too at the cost of new infrastructure.
7. **Backend changes are available, not scheduled.** Maestro on pg-boss is one config swap plus a cutover (register on pg-boss and unregister from BullMQ on next activation or edit, then `reconcile` the remainder in a controlled batch), and CTENG on BullMQ is the mirror image. Neither is planned here. Both wait on the org-level decision about which paths are recommended, and the point of steps 1 to 6 is that whichever way it goes, the work is a cutover rather than a rewrite. Independently of it: delete maestro's dead `SCHEDULER_REDIS_*` config.

## Risks and things to settle early

- **Model unification.** Recommended: RRULE as the canonical model, narrowed by a published profile (decision 2 in "Engine and model: trade-offs"). The remaining work is agreeing the profile, extending maestro's encoder with `times[]` and CTENG's weekday numbering, and writing the decoder plus its round-trip property test. Two profile rules exist to stop known traps: no `BYMINUTE` under `FREQ=MINUTELY`, and `BYMONTHDAY` taken from `DTSTART` and limited to 1 to 28 or `-1` (maestro's `monthDayPosition: 'current'` currently reads the compile date, which is a live bug worth fixing there regardless).
- **Native dependency.** Recommended: `rrule-rust` behind a library-agnostic API (decision 1). Prebuilt binaries for 14 targets, no compile on install, already in maestro's production image. CTENG starts paying the image and lockfile cost. The fixture corpus is the swap guarantee if a pure-JS engine becomes preferable.
- **Behavioural drift during migration.** Maestro's DST one-hour bump and CTENG's Intl resolution can disagree at transition instants. The side-by-side test in step 2 is the guard.
- **pg-boss is new infrastructure for whoever adopts it.** A `pgboss` schema in that service's database, automatic migrations on `start()` (pin the version and disable `migrate` on all but one instance during upgrades), a `pg` pool alongside the existing driver, and poll-interval fire precision. Runbooks change with the backend: on pg-boss, CUJ-002's recovery step becomes "check pending jobs in `pgboss`, run reconcile". This is a cost of choosing the backend, not of adopting the library.
- **Supporting two backends is a standing cost.** Two adapters, two container setups in CI, two runbooks, and a parity contract that has to be maintained as either backend evolves. Picking one now would be cheaper, and that is exactly the call being deferred to the org-level decision, so the cost is accepted deliberately. Keep it bounded by putting parity in one conformance suite and refusing per-backend options in the facade.
- **A dead schedule is silent without reconcile.** `reconcile` ships in the first release and both services run it periodically. What counts as missing differs per backend, and the wrong predicate either hides the outage or pages on healthy schedules: on the chain a live schedule has a pending job, on BullMQ it has a job scheduler with a `next`, and on pg-boss native it has only a `schedule` row with a future `next_run_at`, with no pending job at all between occurrences. `list()` is what normalises that, so the alert stays one diff against the domain table.
- **If the chain ships, its dual path needs an end date up front.** Converting a key on fire, on write or on reconcile keeps callers untouched, but an open-ended series never drains by itself, so without a date the chain code and the dual read outlive their purpose. Set the date when `reconcile` force-converts the remainder in the same release that ships the chain.
- **Read path on the BullMQ adapter.** Returning the structured definition depends on `upsertJobScheduler` template data and on maestro's adapter not falling back to the legacy repeatable path. Verify it against the bullmq version each consumer pins, in the conformance suite, before promising callers a uniform `get()`. If it does not hold on a pinned version, the definition comes from the service's own row on that adapter, as it does in maestro today.
- **Missed-occurrence policy.** CTENG collapses missed fires; BullMQ effectively does too; the pg-boss chain fires the overdue job once and computes the next from now. `catchUp: 'skip' | 'once' | 'all'` makes it explicit, with the per-backend semantics in the table under "Keeping the two adapters interchangeable" and `all` as a pg-boss-only capability. What is still open is which default the products want, and it has to be settled before the first release, because today each backend decides it by accident.
- **Ownership.** A shared scheduler touches revenue-critical paths in two teams' services. Agree on a code owner in `shared-ts-libs` before step 3.
