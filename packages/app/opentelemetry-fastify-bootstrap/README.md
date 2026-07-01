# OpenTelemetry Fastify Bootstrap

This package provides a pre-configured OpenTelemetry setup for Fastify applications with automatic instrumentation.

## Prerequisites

Your application **must** be started with the `--import=@opentelemetry/instrumentation/hook.mjs` Node.js flag. This flag registers the OpenTelemetry instrumentation hook before any application code runs, enabling automatic patching of all imported modules.

In your Dockerfile:

```dockerfile
CMD ["dumb-init", "node", "--import=@opentelemetry/instrumentation/hook.mjs", "/home/node/app/server.js"]
```

When the `--import` hook is used, strict import sequencing is **not** required — you can use regular static imports in your application code. This is the recommended approach for performance reasons, as dynamic imports can cause significantly slower module loading (synchronous module resolution can add 20+ seconds to startup in large applications).

## Installation

```bash
npm install @lokalise/opentelemetry-fastify-bootstrap
```

## Usage

With the `--import` hook in place, use regular static imports and call `initOpenTelemetry` before starting your server:

```ts
// server.ts (entry point)
import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'
import { startServer } from './serverInternal.ts'

// Call this before starting the server
if (process.env.OTEL_ENABLED !== 'false') {
  initOpenTelemetry({
    skippedPaths: ['/health', '/ready', '/live', '/metrics', '/'],
  })
}

await startServer()
```

### Using defaults

If you don't need custom skipped paths:

```ts
import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'

initOpenTelemetry()
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | When set to `test`, OpenTelemetry is disabled | - |
| `OTEL_ENABLED` | Set to `true` to enable OpenTelemetry | `false` |
| `OTEL_EXPORTER_URL` | OTLP gRPC exporter URL | `grpc://localhost:4317` |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skippedPaths` | `string[]` | `['/health', '/metrics', '/']` | Paths to exclude from tracing |
| `consoleSpans` | `boolean` | `false` | Enable console span exporter for debugging |
| `spanProcessors` | `SpanProcessor[]` | `[]` | Additional span processors to register |
| `dbNamespaceBySystem` | `Record<string, string>` | `undefined` | Maps `db.system` values to the `db.namespace` to report for them. When set, the Datadog-bound trace exporter is wrapped so matching outbound DB spans carry `db.namespace` in the export payload, joining them to Datadog's existing inferred-service entity for the cluster. The shared span is left untouched. See [Joining a Datadog inferred-service entity](#joining-a-datadog-inferred-service-entity). |

### Debugging with Console Spans

For local development and debugging, you can enable console span output to see traces printed directly to the console:

```ts
import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'

initOpenTelemetry({
  consoleSpans: true, // Prints spans to console for debugging
})
```

When enabled, spans are printed to the console in addition to being sent to the OTLP exporter. This is useful for verifying that instrumentation is working correctly without needing to run a full observability stack.

### Joining a Datadog inferred-service entity

Datadog's APM service catalog auto-creates inferred-service entities for downstream clusters from peer tags such as `peer.db.system` and `peer.db.name`, deriving `peer.db.name` from the OTel-canonical `db.namespace` (see the [peer-tags precedence list](https://docs.datadoghq.com/tracing/services/inferred_services/?tab=agentv7600#peer-tags) for the authoritative set). When no usable peer tag is present, Datadog falls back to `peer.hostname` — and downstream clusters reached by raw IP (e.g. an Elasticsearch cluster on EC2 addressed by IP) then surface as the synthetic `blocked-ip-address` service in the dependency map.

Some instrumentations don't set `db.namespace`. Notably the Node.js `@elastic/transport` (v8 Elasticsearch client) sets `db.system: elasticsearch` but never `db.namespace`, so outbound ES calls don't join the existing cluster entity.

Pass `dbNamespaceBySystem` to add `db.namespace` based on `db.system`:

```ts
initOpenTelemetry({
  dbNamespaceBySystem: { elasticsearch: 'lokalise' },
})
```

For every span where `db.system: elasticsearch` (or, when `db.system` is absent, `peer.db.system: elasticsearch`), the exported payload gains:

- `db.namespace: lokalise` — the OTel-canonical, vendor-neutral attribute.

Datadog adds the `peer.*` prefix itself, deriving `peer.db.name` from `db.namespace` and `peer.db.system` from `db.system`, so we only set the short-form attribute and never write `peer.*` tags directly. See [Datadog peer tags](https://docs.datadoghq.com/tracing/services/inferred_services/?tab=agentv7600#peer-tags).

#### Why an exporter, not a span processor

A constant such as `lokalise` is a Datadog entity-keying heuristic, not the span's true OTel `db.namespace`. Rather than mutate the single `ReadableSpan` shared by every processor and exporter — which would make any other consumer (a different dashboard, OTel-native tooling) read `lokalise` as the real namespace — `dbNamespaceBySystem` wraps **only** the Datadog-bound exporter. The attribute is added to that exporter's own payload via a non-mutating view of the span; the original is never written to, so it can't be broken by a future SDK that freezes span attributes, and every other consumer sees the unmodified span. An existing non-empty `db.namespace` is never replaced.

`DbNamespaceSpanExporter` is exported from the package if you want to wrap an exporter directly.

### Adding Custom Span Processors

You can integrate additional span processors to send telemetry data to multiple destinations or add custom processing logic.

Multiple span processors work alongside the OTLP exporter and optional console span exporter:

```ts
import { MyCustomSpanProcessor } from './custom-processor'
import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'

initOpenTelemetry({
  consoleSpans: true, // Enable console debugging
  spanProcessors: [
    new MyCustomSpanProcessor({ /* config */ }),
  ],
})
```

## Features

- Automatic instrumentation for Node.js applications via `@opentelemetry/auto-instrumentations-node`
- Fastify-specific instrumentation via `@fastify/otel`
- OTLP gRPC trace exporter
- Configurable path filtering
- Optional console span exporter for debugging
- Support for custom span processors
- Optional `db.namespace` enrichment of the Datadog export payload to join inferred-service entities
- Graceful shutdown support

## Graceful Shutdown

To properly shutdown the OpenTelemetry SDK when your application exits:

```ts
import { gracefulOtelShutdown } from '@lokalise/opentelemetry-fastify-bootstrap'

process.on('SIGTERM', async () => {
  await gracefulOtelShutdown()
  process.exit(0)
})
```
