# @lokalise/pyroscope-profiling

Continuous CPU, wall-clock and heap profiling for Node services, and a way to
read the result from a terminal.

The use case it is built for is the local one: run a load test against the
service on your machine, then find out which function spent the time. A load
test says the cache refresh takes nine seconds, a trace says which span they
were in, and a profile is the only one of the three that names the line. None of
that needs a shared environment, a Grafana or a browser: a Pyroscope container,
one environment variable and `pyroscope-analyze` are the whole loop.

With tracing on, every sample is labelled with the route or job it was taken
under, so the profile can be cut to one user journey and read on its own:

```bash
pyroscope-analyze --service my-service --select 'span_name="POST /v1/content/refresh"'
```

That is one environment variable away once a service already traces, and it is
what turns "the service spends its time in `upsertCacheFieldEntries`" into "the
content refresh does, and the search endpoint does not". See
[Span profiles](#span-profiles).

Shipping to a Grafana stack works too, and is what the deployed environments do,
but it is the bonus rather than the point. See
[Shipping to a Grafana stack](#shipping-to-a-grafana-stack).

Off unless an environment turns it on, and every failure inside it is logged and
swallowed. A profiler that cannot reach its server is not a reason to refuse to
serve traffic.

- [The loop](#the-loop)
- [Install](#install)
- [Wiring it into a service](#wiring-it-into-a-service)
- [Configuration](#configuration)
- [Reading the result](#reading-the-result)
- [Labels](#labels)
- [What gets collected](#what-gets-collected)
- [What it costs](#what-it-costs)
- [On a Windows dev box](#on-a-windows-dev-box)
- [Span profiles](#span-profiles)
- [Shipping to a Grafana stack](#shipping-to-a-grafana-stack)
- [When no profiles arrive](#when-no-profiles-arrive)
- [API](#api)

## The loop

```bash
# 1. Somewhere to put the profiles. Pyroscope alone, no UI stack.
docker compose -f node_modules/@lokalise/pyroscope-profiling/examples/docker-compose.pyroscope.yml up -d

# 2. The service, with profiling on. A shorter flush interval than the 60s
#    default, because a local run is minutes rather than hours.
PYROSCOPE_ENABLED=true \
PYROSCOPE_SERVER_ADDRESS=http://localhost:4040 \
PYROSCOPE_WALL_COLLECT_CPU_TIME=true \
PYROSCOPE_FLUSH_INTERVAL_MS=15000 \
PYROSCOPE_WALL_SAMPLING_DURATION_MS=15000 \
  pnpm run start:dev

# 3. The load test. k6, autocannon, a script, whatever the repo already has.
pnpm run perf:run

# 4. Where the time went.
pnpm exec pyroscope-analyze --service my-service --from now-10m
```

```
{service_name="my-service"}  wall:wall:nanoseconds:wall:nanoseconds
2026-09-16T08:26:54.665Z to 2026-09-16T08:41:54.665Z: 16.93 s total

frame (self)                                       self  share
---------------------------------------------  --------  -----
./src/cache/upsert.ts:upsertCacheFieldEntries    16.62 s  98.2%
:Garbage Collection:0                           214.6 ms   1.3%
node:internal/async_hooks:popAsyncContext:562    10.2 ms   0.1%
```

Then narrow it. `--type cpu` against the default wall profile separates waiting
from working, `--select 'span_name="POST /v1/content/refresh"'` cuts it to one
journey and `--select 'job="cache-refresh"'` to one background job, and
`--against-from` / `--against-until` diffs the run after a change against the
run before it. All of that is [below](#reading-the-result).

Wait 60 seconds after starting Pyroscope before the run. A fresh one drops what
it is sent for about its first minute, which is the most common reason an
otherwise correct setup reports no samples.

### Why not just the UI

Pyroscope ships a UI on `:4040` and it is good. Two reasons the terminal is the
default here anyway. A flame graph encodes its values as rectangle widths, so
reading one means measuring pictures, while the questions a load test raises
("did this frame get cheaper", "what share is GC") are numeric. And a number in
a terminal can go into a PR description, a regression check or a report; a
screenshot cannot.

`--json` and `--folded` are there for when something other than a person is
reading: `--json` for a script or a CI gate, `--folded` for
[flamegraph.pl](https://github.com/brendangregg/FlameGraph) or
[inferno](https://github.com/jonhoo/inferno) if you do want the picture.

## Install

```bash
pnpm add @lokalise/pyroscope-profiling
```

`@pyroscope/nodejs` and its native binding (`@datadog/pprof`) come with it. The
SDK is imported lazily, only once profiling is switched on, so a process that
runs without it neither loads the binding nor depends on it being loadable for
its platform.

Three entry points, so a consumer only pays for what it uses:

| Import | Needs | What it holds |
|---|---|---|
| `@lokalise/pyroscope-profiling` | nothing | Starting and stopping the profiler, config from the environment, manual labels |
| `@lokalise/pyroscope-profiling/opentelemetry` | `@opentelemetry/sdk-trace-base` | The span processor that ties a profile to a trace |
| `@lokalise/pyroscope-profiling/fastify` | `fastify` | A plugin that starts the profiler and flushes it on close |

Both peer dependencies are optional, so a worker or a script can depend on this
package without installing the tracing SDK or Fastify.

The package also installs the `pyroscope-analyze` binary, which talks to
Pyroscope over HTTP and has no dependencies of its own.

## Wiring it into a service

### With Fastify

Register the plugin. It starts the profiler and flushes the last profile window
when the app closes.

```ts
import { pyroscopeProfilingPlugin } from '@lokalise/pyroscope-profiling/fastify'

await app.register(pyroscopeProfilingPlugin, { appName: 'my-service' })
```

That reads `PYROSCOPE_*` from the environment and `APP_ENV` / `APP_VERSION` /
`GIT_COMMIT_SHA` for the labels, so the only thing it needs in code is the name
to file profiles under. Pass `config` and `context` explicitly if the service
resolves its own configuration:

```ts
await app.register(pyroscopeProfilingPlugin, {
  config: config.vendors.pyroscope,
  context: {
    appEnv: config.app.appEnv,
    appVersion: config.app.appVersion,
    gitCommitSha: config.app.gitCommitSha,
  },
})
```

### Covering startup

A plugin cannot run before the app it is registered on exists, so the first
profile window starts after the app is built. Startup is worth profiling on its
own (a slow boot is usually module loading or a migration, and both show up
here), so start the profiler in the entry point and let the plugin do the flush
alone:

```ts
// serverInternal.ts
import { startProfiling } from '@lokalise/pyroscope-profiling'

const config = getConfig()

await startProfiling(
  config.vendors.pyroscope,
  { appEnv: config.app.appEnv, appVersion: config.app.appVersion },
  globalLogger,
)

const app = await getApp(/* ... */)
```

```ts
// app.ts
await app.register(pyroscopeProfilingPlugin, { start: false })
```

`start: false` keeps the `onClose` flush and skips the start. A second
`startProfiling` is a warning and a no-op anyway, and one that arrives while the
first is still loading the SDK joins it rather than starting a second profiler,
so the plugin is safe either way; this just keeps the log clean.

### Without Fastify

A worker, a script or a job runner calls the two functions directly:

```ts
import {
  resolveProfilingConfigFromEnv,
  resolveProfilingContextFromEnv,
  startProfiling,
  stopProfiling,
} from '@lokalise/pyroscope-profiling'

await startProfiling(
  resolveProfilingConfigFromEnv({ appName: 'my-worker' }),
  resolveProfilingContextFromEnv(),
  logger,
)

process.on('SIGTERM', async () => {
  await stopProfiling(logger)
  process.exit(0)
})
```

Do call `stopProfiling`. Without it the wall profile collected since the last
flush is lost, which for a short-lived script is every profile it ever took.

## Configuration

Read by this package:

| Variable | Default | Description |
|---|---|---|
| `PYROSCOPE_ENABLED` | `false` | Whether to profile at all. `true` or `1` |
| `PYROSCOPE_SERVER_ADDRESS` | `http://localhost:4040` | Ingest endpoint |
| `PYROSCOPE_APPLICATION_NAME` | the `appName` passed in code | Name the profiles are filed under, which becomes Pyroscope's `service_name` |
| `PYROSCOPE_AUTH_TOKEN` | | Bearer token. Takes precedence over basic auth when both are set |
| `PYROSCOPE_BASIC_AUTH_USER` | | Basic auth user. For Grafana Cloud Profiles this is the numeric stack id |
| `PYROSCOPE_BASIC_AUTH_PASSWORD` | | Basic auth password, i. e. the Grafana Cloud access token |
| `PYROSCOPE_TENANT_ID` | | `X-Scope-OrgID` for a multi-tenant Pyroscope |
| `PYROSCOPE_SPAN_PROFILES_ENABLED` | `false` | Label samples with the span they were taken under. See [Span profiles](#span-profiles) |

A blank value counts as unset, because a deployment template that leaves a
variable in place but empty is the normal shape of "not configured here". A
local Pyroscope needs none of the credentials.

Profiling also stays off whenever `NODE_ENV` is `test`, whatever
`PYROSCOPE_ENABLED` says, which is what `@lokalise/datadog-fastify-bootstrap`
and `@lokalise/opentelemetry-fastify-bootstrap` do with their own switches. A
`.env` shared with the dev loop would otherwise load the native profiler into
every test worker and post its samples to whatever address that file names.

[`examples/.env.example`](examples/.env.example) is the same list as a file to
copy into a service.

### Sampling rates

Sampling knobs are not part of this package's config, and passing them is not
possible through it on purpose. The Pyroscope SDK reads them from the
environment itself, and anything passed to its `init()` outranks what an
environment set, so a second name for the same setting would silently win:

| Variable | Default |
|---|---|
| `PYROSCOPE_FLUSH_INTERVAL_MS` | `60000` |
| `PYROSCOPE_WALL_SAMPLING_DURATION_MS` | `60000` |
| `PYROSCOPE_WALL_SAMPLING_INTERVAL_MICROS` | `10000`, i. e. 100 Hz |
| `PYROSCOPE_WALL_COLLECT_CPU_TIME` | `false` |
| `PYROSCOPE_HEAP_SAMPLING_INTERVAL_BYTES` | `524288` |
| `PYROSCOPE_HEAP_STACK_DEPTH` | `64` |
| `PYROSCOPE_STRIP_FILENAMES` | unset. `all` or `dependencies` drops source paths from the frames |
| `PYROSCOPE_SHORTEN_PATHS` | `false` |

Two of them are worth changing for a local run. Drop the flush interval and the
wall sampling duration to 15 seconds or less, because at the 60-second default a
three-minute load test produces three data points and the last window arrives
only when the process stops. And turn `PYROSCOPE_WALL_COLLECT_CPU_TIME` on: it
adds a second series taken from the same samples, and the difference between the
two is the difference between "we are busy" and "we are waiting", which is most
of what a Node profile is asked to answer.

### Plugin options

| Option | Default | Description |
|---|---|---|
| `appName` | | Name to file profiles under when `config` is omitted and `PYROSCOPE_APPLICATION_NAME` is unset |
| `config` | `resolveProfilingConfigFromEnv({ appName })` | Where to ship profiles |
| `context` | `resolveProfilingContextFromEnv()` | Labels attached to every profile |
| `logger` | `app.log` | Where the profiler's own diagnostics go |
| `start` | `true` | Whether the plugin starts the profiler. `false` keeps only the `onClose` flush |

With profiling enabled and no name available from either source, the profiler
refuses to start and logs an error rather than filing profiles under an empty
name, which is a series nobody can find.

## Reading the result

```
pyroscope-analyze --service <name> [options]
```

| Option | Default | Description |
|---|---|---|
| `--service <name>` | required | The app name profiles were shipped under |
| `--url <url>` | `PYROSCOPE_SERVER_ADDRESS`, else `http://localhost:4040` | Pyroscope base URL |
| `--type <type>` | `wall` | `wall`, `cpu`, `samples`, `heap`, `objects`, or a full profile type id |
| `--select <matchers>` | | Extra label matchers, e. g. `job="cache-refresh"` |
| `--from <when>` | `now-15m` | `now-<n>[smh]`, an ISO timestamp or Unix millis |
| `--until <when>` | `now` | The same formats |
| `--against-from <when>` | | Second range to diff against, per frame |
| `--against-until <when>` | the start of `--from` | End of the second range |
| `--top <n>` | `20` | Rows to print |
| `--tree` | off | Also print the call tree, indented, one value per line |
| `--min-share <percent>` | `1` | Frames below this share are left out of the tree |
| `--json` | off | Machine-readable output |
| `--folded <file>` | | Also write collapsed stacks |
| `--auth-token <token>` | `PYROSCOPE_AUTH_TOKEN` | Bearer token, which takes precedence over basic auth |
| `--basic-auth-user <user>` | `PYROSCOPE_BASIC_AUTH_USER` | For Grafana Cloud Profiles, the numeric stack id |
| `--basic-auth-password <secret>` | `PYROSCOPE_BASIC_AUTH_PASSWORD` | Basic auth password |
| `--tenant-id <id>` | `PYROSCOPE_TENANT_ID` | Sent as `X-Scope-OrgID` |

The credentials default to the same variables the service ships profiles with,
so pointing `PYROSCOPE_SERVER_ADDRESS` at Grafana Cloud Profiles or a
multi-tenant Pyroscope is enough for reading as well as writing. A local
Pyroscope needs none of them.

An option it does not know is an error rather than something it ignores, so a
mistyped `--tre` says so instead of printing a profile without the tree.

### Self time first, because a Node wall profile has nothing else

A wall profile of async Node code does not roll up. Every `await` resumes in a
microtask whose stack root is the scheduler rather than the caller, so a
function that drove a whole request can show a cumulative share close to zero,
and its flat self time is the only number that means anything. That is why the
default output is the flat table rather than a tree.

`--tree` is for the question that comes next, once the table has named a frame
and you want to know who called it. It prints the nesting with an exact value on
every line rather than as rectangle widths:

```
frame                         total   share      self
-------------------------  --------  ------  --------
total                       16.93 s  100.0%
  ./run.mjs:burn:21         16.55 s   97.8%   16.54 s
  :Node.js:0               214.6 ms    1.3%
    :Garbage Collection:0  214.6 ms    1.3%  214.6 ms
```

Labels are the other half of the answer, and the one that scales: `span_name`
and `span_id` from [span profiles](#span-profiles) for a request, `job` from
[`withProfilingLabels`](#labelling-work-that-has-no-request-behind-it) for a
background job. Without them the stack will not say which request a sample came
from.

### Wall time is not CPU time

```bash
pyroscope-analyze --service my-service              # wall
pyroscope-analyze --service my-service --type cpu   # CPU, same samples
```

Reading the two against each other is the fastest route to a diagnosis:

- wide in wall, narrow in CPU: waiting. The fix is upstream, in a query, a
  batch size or a downstream call, not in this frame.
- wide in both: the service is burning CPU here.
- a CPU profile carrying a large `:(idle):0` frame under full load: the
  bottleneck is not CPU, and making this code faster will not move the response
  time.

### Comparing two runs

This is what the local loop is for: run the load test, change something, run it
again, and ask what moved.

```bash
# Note the time before the second run
MARK=$(date +%s000)
pnpm run perf:run

# The second run, against everything before it
pyroscope-analyze --service my-service --from "$MARK" --against-from now-30m --against-until "$MARK"
```

```
2026-09-16T08:34:49.000Z to 2026-09-16T08:35:09.000Z: 17.41 s total
against 2026-09-16T08:20:09.712Z to 2026-09-16T08:34:49.000Z: 33.88 s total (-16.47 s)

frame (self)                                       self  share      delta
---------------------------------------------  --------  -----  ---------
./src/cache/upsert.ts:upsertCacheFieldEntries   17.17 s  98.6%   -15.83 s
:Garbage Collection:0                          174.1 ms   1.0%  -481.7 ms
```

Rows are ordered by how far the two ranges moved apart rather than by size, so
the frame a change affected comes first even when it is not the biggest one.
Compare like with like: two runs of the same shape, the same load profile and
the same catalog size, or the deltas are measuring the difference between the
runs rather than the difference the change made.

Profiles live on a named volume that `docker compose down` spares, so the run
before a change is still there tomorrow. `docker compose down -v` drops them.

### In a script or a CI gate

`--json` gives the same data with exact numbers, which is enough to assert on:

```bash
pyroscope-analyze --service my-service --json --from now-5m \
  | node -e 'const p=JSON.parse(require("fs").readFileSync(0));
             const gc=p.frames.find(f=>f.name.includes("Garbage Collection"));
             if (gc && gc.share > 0.15) { console.error(`GC at ${(gc.share*100).toFixed(1)}%`); process.exit(1) }'
```

It exits 2 with a message on standard error when the range holds no samples, so
a harness can tell "nothing arrived" from "arrived and looks fine".

### Straight out of Pyroscope

`pyroscope-analyze` is a client for three endpoints, and they are worth knowing
for anything it does not do:

```bash
# Which services have profiles
curl -s -X POST -H 'content-type: application/json' \
  -d '{"name":"service_name","matchers":["{}"]}' \
  http://localhost:4040/querier.v1.QuerierService/LabelValues

# Which profile types arrived for one of them
curl -s -X POST -H 'content-type: application/json' \
  -d '{"name":"__profile_type__","matchers":["{service_name=\"my-service\"}"]}' \
  http://localhost:4040/querier.v1.QuerierService/LabelValues

# The flame graph itself, as JSON, filtered by a label
curl -s -X POST -H 'content-type: application/json' \
  -d '{"profileTypeID":"wall:wall:nanoseconds:wall:nanoseconds",
       "labelSelector":"{service_name=\"my-service\", job=\"cache-refresh\"}",
       "start":1700000000000,"end":1700003600000,"maxNodes":64}' \
  http://localhost:4040/querier.v1.QuerierService/SelectMergeStacktraces
```

`start` and `end` are Unix milliseconds. The flame graph comes back in the
flamebearer encoding: one flat array per depth level, four numbers per node,
`[offsetFromPreviousSibling, total, self, nameIndex]`.

## Labels

Every profile carries four labels, so one environment, release or pod can be
isolated:

| Label | From |
|---|---|
| `env` | `APP_ENV` |
| `version` | `APP_VERSION`, with a trailing `@<build timestamp>` stripped, so two pods of one release share a value |
| `commit_sha` | `GIT_COMMIT_SHA` |
| `instance` | the hostname, which is the pod name in Kubernetes |

A label whose source is missing is left out rather than shipped empty, and an
`APP_VERSION` that is nothing but a build timestamp keeps it rather than
shipping `version=`, which nobody could filter on.

Two more are attached per sample rather than per profile, and they are the ones
that cut a flame graph to one unit of work: `span_name` and `span_id` from
[span profiles](#span-profiles) for a request, `job` or whatever else
[`withProfilingLabels`](#labelling-work-that-has-no-request-behind-it) is given
for a background job.

Add your own through `context.tags`, which is merged last and can therefore also
replace any of the four:

```ts
{ appEnv: 'production', tags: { region: 'eu-west-1', shard: 'a' } }
```

For a local load test the useful one is the shape of the run, so that two runs
are comparable by selector instead of by remembering which was which:

```ts
{ tags: { catalog: '20000', chunk: '250' } }
```

```bash
pyroscope-analyze --service my-service --select 'catalog="20000"'
```

`{`, `}`, `,` and `=` are replaced with `_` in both keys and values, and in the
app name. Pyroscope encodes the name and the labels into one string
(`appName{key=value,key=value}`) and rejects all four, so an `APP_VERSION` that
happened to carry a comma would otherwise take the service down at startup over
a profiler label.

### Labelling work that has no request behind it

For a background job or a scheduled task there is no span to filter by, so the
labels have to be set by hand. `withProfilingLabels` does it around one unit of
work and puts the previous labels back afterwards:

```ts
import { withProfilingLabels } from '@lokalise/pyroscope-profiling'

await withProfilingLabels({ job: 'cache-refresh', items: itemCount }, () =>
  this.refreshCache(tenantId),
)
```

The profile can then be cut to `--select 'job="cache-refresh"'`, which turns
"who spent these nine seconds" into a query. It is a no-op beyond calling the
function when profiling is off, and it never changes what the function returns
or throws.

Two limits, both inherited from how the profiler tracks labels. It carries one
label set for the whole process rather than one per async context, so work the
function starts and does not await is labelled by whatever is current when it
resumes, and two calls that overlap both write to the same set: the samples
taken while both are open carry the labels of whichever started last. Closing a
call hands the labels back to the one still running, so nothing is left labelled
by work that has finished, but a run with ten of these in flight at once will
not attribute its samples ten ways. Label the outermost unit of work, not every
function inside it, and read overlapping labels as approximate.

## What gets collected

Two profilers run, both continuous, both flushed on `PYROSCOPE_FLUSH_INTERVAL_MS`.
They ingest as these profile types, which are what `--type` is shorthand for:

| `--type` | Profile type | Requires | What it shows |
|---|---|---|---|
| `wall` | `wall:wall:nanoseconds:wall:nanoseconds` | | Where wall-clock time goes, including time spent waiting on a dependency |
| `cpu` | `wall:cpu:nanoseconds:wall:nanoseconds` | `PYROSCOPE_WALL_COLLECT_CPU_TIME=true` | The CPU time inside that wall time |
| `samples` | `wall:samples:count:wall:nanoseconds` | | Sample counts behind the two above |
| `heap` | `memory:inuse_space:bytes:inuse_space:bytes` | | Which call paths hold live heap |
| `objects` | `memory:inuse_objects:count:inuse_space:bytes` | | The same, counted in objects |

`wall`, not `process_cpu`. Grafana's own trace-to-profiles documentation uses
`process_cpu:cpu:nanoseconds:cpu:nanoseconds`, which is the Go and Java naming;
a Node service ingesting through this SDK will not match it.

Two things the profiles will not tell you, worth knowing before one is read as
evidence.

The heap profile is retention only. The SDK takes it with `@datadog/pprof`'s
heap profiler, which emits `inuse_space` and `inuse_objects` and no
`alloc_space` series, and it has no knob for one. What a path holds on to is
available; what a run allocated and freed is not.

And a heap profile is only ever shipped by the periodic flush, never by
`stopProfiling`, which flushes the wall profile alone. A process that blocks its
event loop for its whole life (a tight synchronous loop, a benchmark that never
yields) ships no heap profile at all, and no wall profile either until it stops,
because the flush runs on a timer that never gets to fire. If a load test
produces wall profiles and no heap profiles, that is the reason.

## What it costs

Sampling at 100 Hz costs a few percent of CPU, and the SDK holds one profile in
memory between flushes. Measure it rather than trusting the estimate: run the
load test with and without `PYROSCOPE_ENABLED` and compare the latency
percentiles. Do that once for the service rather than assuming, and do not read
a profiled run's absolute latencies as the unprofiled ones.

The native binding ships prebuilt for linux (glibc and musl, x64 and arm64),
macOS (x64 and arm64) and Windows x64, so an image build can keep
`--ignore-scripts`. Windows arm64 has no prebuild.

With pnpm, `@datadog/pprof` only needs to be allowed to run its install script
if you are not relying on those prebuilds. If you do allow it, add it to
`allowBuilds` (pnpm 11) or `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

## On a Windows dev box

The local loop above is the primary use case, and this is the one place it does
not work as written. Profiling works on linux and macOS, which covers every
deployed environment and most laptops. On Windows the wall profiler refuses to
start:

```
TypeError: Contexts are not supported.
    at Object.start (@datadog/pprof/out/src/time-profiler.js)
```

Labelled profiles need SIGPROF-based sampling, `@datadog/pprof` compiles that
path out on `_WIN32`, and Pyroscope's wall profiler always asks for labels. Heap
profiling never gets its turn, because wall starts first.

Nothing breaks. `startProfiling` logs the error, returns `false`, and the service
serves traffic as usual without profiles. `stopProfiling` then has nothing to
flush and is a no-op. `pyroscope-analyze` will report no samples, which is the
symptom to expect.

The service therefore has to run on linux for the loop to close. Two ways, in
order of how much they cost:

1. **WSL2.** Run the service inside WSL2 and keep the Pyroscope container on the
   Windows side. WSL2 reaches published Windows ports on `localhost`, so
   `PYROSCOPE_SERVER_ADDRESS=http://localhost:4040` needs no change, and
   `pyroscope-analyze` can be run from either side. This is the cheapest
   option and what to reach for first.
2. **The service's own container.** Run it in the image it deploys as, on the
   same compose network as Pyroscope, which makes the address
   `http://pyroscope:4040`. Slower to iterate on, and the closest to what
   production measures, since it profiles the artifact that ships. If the load
   test drives the service from the Windows side, publish its port and point the
   test at `localhost`.

If the service stays a Windows host process and only the load generator is
containerised, it will not be profiled. That combination is worth refusing
explicitly in a load-test runner rather than handing back an empty flame graph.

Do not spend time looking for a Windows workaround inside the profiler. The
missing piece is in the native binding, and it is compiled out rather than
configurable.

## Span profiles

Once tracing is in the picture, the labels can come from it instead of by hand.
While a local root span is open the profiler's samples carry `span_id` and
`span_name`, and the span carries `pyroscope.profile.id`, which is what a
Grafana trace view follows to the profile.

This is the feature that makes a flame graph per user journey, and it costs one
environment variable in a service that already traces.

```ts
// server.ts, before the app is imported
import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'
import { buildPyroscopeSpanProcessors } from '@lokalise/pyroscope-profiling/opentelemetry'

initOpenTelemetry({
  skippedPaths: ['/health', '/metrics', '/'],
  spanProcessors: buildPyroscopeSpanProcessors(),
})
```

```bash
OTEL_ENABLED=true
PYROSCOPE_ENABLED=true
PYROSCOPE_SPAN_PROFILES_ENABLED=true
```

All three, because a label needs a span to come from and a profiler to land on.
With either Pyroscope switch off `buildPyroscopeSpanProcessors` returns an empty
array and tracing behaves exactly as it did before.

### A flame graph per journey

`span_name` is the label that pays off locally: it is the route or the job name,
it is the same across every run of that journey, and it needs no code change to
appear.

```bash
# Where the checkout journey spends its time
pyroscope-analyze --service my-service --select 'span_name="POST /v1/checkout"'

# The same frame in another journey, to tell "this endpoint is slow" from
# "this function is slow everywhere"
pyroscope-analyze --service my-service --select 'span_name="GET /v1/catalog"'

# One journey, before and after a change. $MARK is the timestamp between the
# two runs, as in "Comparing two runs" above.
pyroscope-analyze --service my-service --select 'span_name="POST /v1/checkout"' \
  --from "$MARK" --against-from now-30m --against-until "$MARK"
```

A load test that drives several journeys at once therefore produces one profile
per journey out of a single run, which is the difference between optimising the
service and optimising the endpoint that is actually slow. `--json --select` is
the same thing for a CI gate, per journey rather than per service.

`span_id` is per request, so it is the one a Grafana trace view uses rather than
something to filter by from a terminal. Pair it with `--tree` once a journey's
table has named a frame and the question becomes who called it.

### What is labelled, and how exactly

Only local root spans: a span with no parent, or one whose parent is in another
process, which is what an incoming request carrying a `traceparent` looks like.
A child span shares the process-wide label set with its parent, so labelling
both would mean the inner span deciding what the outer one's samples say, and
the outer span is the request or the job, which is the unit worth filtering by.
A service sitting behind a traced caller is still labelled, because its server
span is the outermost one in its own process.

The profiler carries one label set for the whole process rather than one per
async context, so the samples taken while two root spans are open carry the
labels of whichever started last, and work a span starts without awaiting is
labelled by whatever is current when it resumes. A span that ends hands the
labels back to the request still open, so nothing keeps the id of a request that
has finished, but the attribution is a sample of the truth rather than the whole
of it. Read it as exact on a local run driving one journey at a time, and as
approximate at production concurrency.

The processor is exported on its own as `PyroscopeSpanProcessor` for a tracing
setup that does not go through `@lokalise/opentelemetry-fastify-bootstrap`. It
takes an optional logger, used only to report a profiler that refuses to be
labelled, once at `warn` and at `debug` after that: whatever makes labelling
fail keeps failing, and one line per request would bury the output it was meant
to explain.

## Shipping to a Grafana stack

Nothing about the service changes: point `PYROSCOPE_SERVER_ADDRESS` at the
shared Pyroscope and add whichever credential it wants.

```bash
# Self-hosted
PYROSCOPE_ENABLED=true
PYROSCOPE_SERVER_ADDRESS=http://pyroscope.monitoring:4040

# Grafana Cloud Profiles, where the password is an access token with the
# `profiles:write` scope and the user is the numeric stack id
PYROSCOPE_ENABLED=true
PYROSCOPE_SERVER_ADDRESS=https://profiles-prod-eu-west-0.grafana.net
PYROSCOPE_BASIC_AUTH_USER=123456
PYROSCOPE_BASIC_AUTH_PASSWORD=glc_...
```

Two deployment details to check, neither of them in the image:

- The ingest endpoint has to be reachable from inside the container.
  `http://localhost:4040` is the container's own loopback, so a Pyroscope on the
  host needs `http://host.docker.internal:4040` and an `extra_hosts` entry for
  `host-gateway`.
- `instance` comes from the hostname, which is the pod name in Kubernetes and
  the container id under plain Docker. The first is useful; the second changes
  on every run, so a profile filtered by it is only readable during the run that
  produced it.

For a browser locally, [`examples/`](examples) has Grafana as an overlay on the
same Pyroscope:

```bash
docker compose -f docker-compose.pyroscope.yml -f docker-compose.grafana.yml up -d
```

Grafana is then on <http://localhost:3000> with the Pyroscope datasource
provisioned and anonymous admin access, so there is no login step. Its diff view
is worth the bring-up when a per-frame comparison of two runs needs to be
explored rather than asserted; `--against-from` answers the same question
without it.

A third overlay adds Tempo, which is what turns a span in a trace into a link to
the profile taken while it was open:

```bash
docker compose -f docker-compose.pyroscope.yml -f docker-compose.grafana.yml \
               -f docker-compose.tracing.yml up -d
```

The Tempo datasource is provisioned with `tracesToProfiles` pointing back at
Pyroscope, using `profileTypeId: wall:wall:nanoseconds:wall:nanoseconds` and the
tag mapping `service.name` to `service_name`. See
[`examples/grafana/tempo-datasource.yml`](examples/grafana/tempo-datasource.yml)
for the shape to copy into a shared Grafana.

## When no profiles arrive

Work down this list.

**Has Pyroscope been up for a minute?** A fresh one answers `/ready` with 503
for about 60 seconds, because the segment writer waits after becoming ready, and
it drops what it is sent in the meantime. This is the most common cause of an
empty result from an otherwise correct local setup.

```bash
curl -s http://localhost:4040/ready   # "ready" when it will keep what you send
```

**Is the profiler running at all?** A successful start logs
`[PYROSCOPE] Continuous profiling started` with the resolved app name, endpoint
and labels. A failed one logs `[PYROSCOPE] Failed to start continuous profiling`
with the error. Nothing at all means `PYROSCOPE_ENABLED` is not `true`, or that
`NODE_ENV` is `test`, which is off whatever the switch says.

**Has a flush happened yet?** The first one is `PYROSCOPE_FLUSH_INTERVAL_MS`
after start, 60 seconds by default. Lower it rather than waiting.

**Is the exporter being refused?** The SDK reports a rejected or failed ingest
through `debug`, not through the app logger, so a broken endpoint is silent by
default. Make it talk:

```bash
DEBUG=pyroscope* PYROSCOPE_ENABLED=true pnpm run start:dev
```

That also prints one `pyroscope::profiler::wall profile` line per flush, which
is how you tell "the endpoint is rejecting me" from "no flush has happened yet".

**Is the event loop free?** The flush runs on a timer. A process in a tight
synchronous loop ships nothing until it stops, and ships no heap profile even
then.

**Do the samples arrive without `span_name`?** Span profiles need all three
switches (`OTEL_ENABLED`, `PYROSCOPE_ENABLED`, `PYROSCOPE_SPAN_PROFILES_ENABLED`)
and `buildPyroscopeSpanProcessors()` has to reach `initOpenTelemetry` through
its `spanProcessors`. A labelled request also writes `pyroscope.profile.id` onto
its span, so a trace that carries no such attribute says the processor never ran.

```bash
# Which journeys are labelled at all
curl -s -X POST -H 'content-type: application/json' \
  -d '{"name":"span_name","matchers":["{service_name=\"my-service\"}"]}' \
  http://localhost:4040/querier.v1.QuerierService/LabelValues
```

**Is the range right?** `pyroscope-analyze` defaults to `--from now-15m`. A run
from this morning needs `--from` to say so, and a container whose clock has
drifted from the host's will put its samples outside a window computed on the
host.

**Is this Windows?** See [above](#on-a-windows-dev-box): the error will be
`Contexts are not supported`.

## API

From `@lokalise/pyroscope-profiling`:

| Export | Description |
|---|---|
| `startProfiling(config, context, logger)` | Starts profiling. Returns whether it is now running; never throws |
| `stopProfiling(logger)` | Flushes the last wall profile, with a five-second ceiling. A no-op when nothing is running |
| `isProfilingRunning()` | Whether a start succeeded and no stop has run |
| `runningProfiler()` | The SDK module while it is profiling, for reaching past this package |
| `resolveProfilingConfigFromEnv({ appName?, env? })` | A `ProfilingConfig` from `PYROSCOPE_*` |
| `resolveProfilingContextFromEnv(env?)` | A `ProfilingContext` from `APP_ENV`, `APP_VERSION`, `GIT_COMMIT_SHA` |
| `isSpanProfilingEnabledInEnv(env?)` | Whether both span-profile switches are on |
| `withProfilingLabels(labels, fn)` | Runs `fn` with `labels` on its samples |
| `getProfilingLabels()` | The labels currently being attached, or `{}` |

From `@lokalise/pyroscope-profiling/opentelemetry`:

| Export | Description |
|---|---|
| `buildPyroscopeSpanProcessors(logger?)` | One `PyroscopeSpanProcessor` when span profiles are on, none otherwise |
| `PyroscopeSpanProcessor` | The processor itself, for a tracing setup that builds its own list |

From `@lokalise/pyroscope-profiling/fastify`:

| Export | Description |
|---|---|
| `pyroscopeProfilingPlugin` | Starts the profiler on register, flushes it on close |

`stopProfiling` gives up after five seconds. Pyroscope's exporter posts with
`fetch` and no timeout of its own and swallows its own errors, so an ingest host
that accepts the connection and then goes quiet would otherwise hold
`app.close()` open until the platform kills the process. Losing the last profile
window is the cheaper outcome.

Types: `ProfilingConfig`, `ProfilingContext`, `ProfilingLogger`,
`ProfilingLabels`, `PyroscopeProfilingPluginOptions`. `ProfilingLogger` is a
structural six-level logger, satisfied by pino, `@lokalise/node-core`'s
`CommonLogger` and Fastify's `app.log`, so this package needs no logging
dependency of its own.
