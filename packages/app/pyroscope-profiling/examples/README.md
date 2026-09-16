# Examples

A Pyroscope to ship profiles to during a local load test. That is the whole base
stack, because reading a profile does not need a UI: `pyroscope-analyze` queries
Pyroscope over HTTP and prints the result.

```bash
docker compose -f docker-compose.pyroscope.yml up -d

# Wait for it. A fresh Pyroscope drops what it is sent for about a minute.
curl -s http://localhost:4040/ready

# The service, with a flush interval a local run can actually use
PYROSCOPE_ENABLED=true \
PYROSCOPE_SERVER_ADDRESS=http://localhost:4040 \
PYROSCOPE_WALL_COLLECT_CPU_TIME=true \
PYROSCOPE_FLUSH_INTERVAL_MS=15000 \
PYROSCOPE_WALL_SAMPLING_DURATION_MS=15000 \
  pnpm run start:dev

# The load test, then the answer
pnpm run perf:run
pnpm exec pyroscope-analyze --service my-service --from now-10m --tree
```

Stopping keeps the profiles, so the run before a change is still there to read
the run after it against:

```bash
docker compose -f docker-compose.pyroscope.yml down      # keeps them
docker compose -f docker-compose.pyroscope.yml down -v   # drops them
```

## Overlays

Two, for the times a browser earns its bring-up. Each needs the files before it
on the command line.

```bash
# Grafana on :3000, datasource provisioned, no login
docker compose -f docker-compose.pyroscope.yml -f docker-compose.grafana.yml up -d

# Plus Tempo on :4317, so a span links to the profile taken while it was open
docker compose -f docker-compose.pyroscope.yml -f docker-compose.grafana.yml \
               -f docker-compose.tracing.yml up -d
```

With the tracing overlay, add to the service:

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_URL=grpc://localhost:4317
PYROSCOPE_SPAN_PROFILES_ENABLED=true
```

Every request is then labelled with the route it was served by, so one load test
gives a flame graph per journey rather than one for the whole service:

```bash
pyroscope-analyze --service my-service --select 'span_name="POST /v1/checkout"'
```

## Files

| File | What it is |
|---|---|
| `docker-compose.pyroscope.yml` | Pyroscope alone, which is all the local loop needs |
| `docker-compose.grafana.yml` | Overlay adding Grafana and the Pyroscope datasource |
| `docker-compose.tracing.yml` | Overlay adding Tempo and the trace-to-profiles link |
| `grafana/pyroscope-datasource.yml` | Provisioned Pyroscope datasource |
| `grafana/tempo-datasource.yml` | Provisioned Tempo datasource, including `tracesToProfiles` |
| `tempo/tempo.yaml` | Single-binary Tempo on local storage |
| `.env.example` | Every variable, with the defaults it would otherwise take |

Ports are overridable (`PYROSCOPE_PORT`, `GRAFANA_PORT`, `TEMPO_OTLP_GRPC_PORT`),
because "4040 is already allocated" is the normal state of a machine with more
than one service checked out.

Everything here is for local use. An unauthenticated Pyroscope and an anonymous
admin Grafana are fine on a laptop and belong nowhere else.

The datasources are mounted file by file rather than as a provisioning
directory. A file mount nested inside a read-only directory mount is refused by
the container runtime, and Grafana does not read datasource files from
subdirectories, so one file per mount is what lets an overlay add a second
datasource next to the first.

See the [package README](../README.md) for what the profiles contain and how to
read them.
