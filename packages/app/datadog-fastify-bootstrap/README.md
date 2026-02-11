# Datadog Fastify Bootstrap

This package provides a pre-configured Datadog APM setup for Fastify applications using the native `dd-trace` library, with support for auto-instrumentation, runtime metrics, profiling, and log injection.

**Important:** `dd-trace` must be initialized before importing any modules you want to instrument (fastify, http, etc.), because it works by patching module exports at import time. This requires using dynamic imports to control the loading order.

## Installation

```bash
npm install @lokalise/datadog-fastify-bootstrap dd-trace
```

## ESM Loader Requirement

When running an ESM application (`"type": "module"`), Node.js requires the `dd-trace` loader to be registered via the `--import` flag:

```bash
node --import dd-trace/initialize.mjs app.js
```

Without this flag, `dd-trace` cannot hook into ESM module loading and auto-instrumentation will not work.

## Usage

Your application entry point must use dynamic `await import()` to ensure `dd-trace` initializes before other modules are loaded:

```ts
// index.ts (entry point)

// This MUST be first - initializes dd-trace before anything else
const { initDatadog } = await import('@lokalise/datadog-fastify-bootstrap')
initDatadog({
  service: 'my-api',
  env: 'production',
  skippedPaths: ['/health', '/ready', '/live', '/metrics', '/'],
})

// Now dynamically import your actual server code
const server = await import('./server.ts')
await server.start()
```

**Why dynamic imports?** Static imports in ESM are hoisted and resolved together before any code executes. Dynamic `await import()` ensures sequential loading — the tracer fully initializes before server.ts is even parsed.

### Using defaults

If you don't need custom configuration:

```ts
const { initDatadog } = await import('@lokalise/datadog-fastify-bootstrap')
initDatadog()
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | When set to `test`, tracing is disabled | - |
| `DD_TRACE_ENABLED` | Set to `true` to enable Datadog tracing | `false` |
| `OTEL_ENABLED` | Fallback for `DD_TRACE_ENABLED` (for migration from OTEL package) | `false` |
| `DD_TRACE_AGENT_URL` | Full URL of the Datadog Agent (e.g. `http://dd-agent:8126`) | - |
| `OTEL_EXPORTER_URL` | Fallback for `DD_TRACE_AGENT_URL` (for migration from OTEL package) | - |
| `DD_SERVICE` | Service name (can also be set via options) | inferred from package.json |
| `DD_ENV` | Environment name (can also be set via options) | - |
| `DD_VERSION` | Application version (can also be set via options) | inferred from package.json |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `service` | `string` | - | Service name reported to Datadog |
| `env` | `string` | - | Environment name (e.g. prod, staging) |
| `version` | `string` | - | Application version |
| `url` | `string` | - | Full URL of the DD Agent. Takes priority over `agentHost`/`agentPort` |
| `agentHost` | `string` | `'127.0.0.1'` | Datadog Agent hostname. Ignored when `url` is set |
| `agentPort` | `number` | `8126` | Datadog Agent trace port. Ignored when `url` is set |
| `skippedPaths` | `string[]` | `['/health', '/metrics', '/']` | Paths to exclude from tracing |
| `runtimeMetrics` | `boolean` | `false` | Enable runtime metrics collection |
| `profiling` | `boolean` | `false` | Enable continuous profiling |
| `logInjection` | `boolean` | `false` | Inject trace IDs into log records |
| `sampleRate` | `number` | - | Global trace sample rate (0 to 1) |
| `debug` | `boolean` | `false` | Enable dd-trace debug logging |
| `startupLogs` | `boolean` | `true` | Enable dd-trace startup logs |
| `tags` | `Record<string, string>` | - | Additional tags for every span and metric |

## Features

- Automatic instrumentation for Node.js applications via `dd-trace`
- Runtime metrics collection (event loop, GC, heap)
- Continuous profiling (CPU and heap)
- Trace ID injection into application logs
- Configurable path filtering
- Custom tags for spans and metrics
- Graceful shutdown with trace flushing

## Custom Spans

Use `getTracer()` to access the tracer instance for creating custom spans:

```ts
import { getTracer } from '@lokalise/datadog-fastify-bootstrap'

const tracer = getTracer()
const span = tracer?.startSpan('my.custom.operation')
try {
  // ... do work ...
} finally {
  span?.finish()
}
```

## Graceful Shutdown

To properly flush pending traces when your application exits:

```ts
import { gracefulDatadogShutdown } from '@lokalise/datadog-fastify-bootstrap'

process.on('SIGTERM', async () => {
  await gracefulDatadogShutdown()
  process.exit(0)
})
```
