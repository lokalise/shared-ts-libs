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

### Debugging with Console Spans

For local development and debugging, you can enable console span output to see traces printed directly to the console:

```ts
import { initOpenTelemetry } from '@lokalise/opentelemetry-fastify-bootstrap'

initOpenTelemetry({
  consoleSpans: true, // Prints spans to console for debugging
})
```

When enabled, spans are printed to the console in addition to being sent to the OTLP exporter. This is useful for verifying that instrumentation is working correctly without needing to run a full observability stack.

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
