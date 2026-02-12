# OpenTelemetry Fastify Bootstrap

This package provides a pre-configured OpenTelemetry setup for Fastify applications with automatic instrumentation.

**Important:** OpenTelemetry must be initialized before importing any modules you want to instrument (fastify, http, etc.), because it works by patching module exports at import time. This requires using dynamic imports to control the loading order.

## Installation

```bash
npm install @lokalise/opentelemetry-fastify-bootstrap
```

## Usage

Your application entry point must use dynamic `await import()` to ensure OpenTelemetry initializes before other modules are loaded:

```ts
// index.ts (entry point)

// This MUST be first - initializes OpenTelemetry before anything else
const { initOpenTelemetry } = await import('@lokalise/opentelemetry-fastify-bootstrap')
initOpenTelemetry({
  skippedPaths: ['/health', '/ready', '/live', '/metrics', '/'],
})

// Now dynamically import your actual server code
const server = await import('./server.ts')
await server.start()
```

**Why dynamic imports?** Static imports in ESM are hoisted and resolved together before any code executes. Dynamic `await import()` ensures sequential loading - the package fully initializes before server.ts is even parsed.

### Using defaults

If you don't need custom skipped paths:

```ts
const { initOpenTelemetry } = await import('@lokalise/opentelemetry-fastify-bootstrap')
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
const { initOpenTelemetry } = await import('@lokalise/opentelemetry-fastify-bootstrap')
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

const { initOpenTelemetry } = await import('@lokalise/opentelemetry-fastify-bootstrap')
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
