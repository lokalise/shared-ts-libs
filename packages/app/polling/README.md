# Polling

This package provides a flexible polling system with a strategy-based architecture, making it easy to implement different retry patterns.

## Features

- **Strategy Pattern**: Pluggable polling strategies for different use cases
- **Exponential Backoff**: Built-in strategy with automatic delay increases
- **Jitter Support**: Adds randomization to prevent thundering herd problems
- **Builder Pattern**: Fluent API for creating pollers
- **Type-Safe**: Full TypeScript support with strict types
- **Error Handling**: Domain-specific error handling with timeout support
- **Extensible**: Easy to add custom polling strategies

## Usage

### Basic Example with Builder Pattern

```typescript
import {
  createPollerBuilder,
  STANDARD_EXPONENTIAL_BACKOFF_CONFIG,
  type PollResult,
} from '@lokalise/polling'
import type { RequestContext } from '@lokalise/fastify-extras'

// Create a poller with exponential backoff strategy
const poller = createPollerBuilder()
  .withExponentialBackoff(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)
  .build()

// Your polling function
async function checkJobStatus(jobId: string): Promise<PollResult<JobResult>> {
  const job = await getJob(jobId)

  if (job.status === 'completed') {
    return { isComplete: true, value: job.result }
  }

  if (job.status === 'failed') {
    throw new Error('Job failed')
  }

  return { isComplete: false }
}

// Poll until complete
try {
  const result = await poller.poll(
    () => checkJobStatus('job-123'),
    reqContext,
    { jobId: 'job-123' }, // optional metadata for logging
  )
  console.log('Job completed:', result)
} catch (error) {
  if (error instanceof PollingError) {
    console.error('Polling timeout:', error.attemptsMade)
  } else {
    console.error('Job failed:', error)
  }
}
```

### Custom Configuration

```typescript
import {
  createPollerBuilder,
  type ExponentialBackoffConfig,
} from '@lokalise/polling'

const customConfig: ExponentialBackoffConfig = {
  initialDelayMs: 1000, // Start with 1 second
  maxDelayMs: 30000, // Cap at 30 seconds
  backoffMultiplier: 2.0, // Double the delay each time
  maxAttempts: 10, // Maximum 10 attempts
  jitterFactor: 0.1, // 10% jitter
}

const poller = createPollerBuilder()
  .withExponentialBackoff(customConfig)
  .build()

await poller.poll(myPollFn, reqContext)
```

## Exponential Backoff Configuration

- `initialDelayMs`: Initial delay between attempts (milliseconds)
- `maxDelayMs`: Maximum delay between attempts (milliseconds)
- `backoffMultiplier`: Multiplier applied to delay after each attempt
- `maxAttempts`: Maximum number of polling attempts before timeout
- `jitterFactor`: Randomization factor (0-1) to prevent synchronized requests

## Standard Config

The package includes `STANDARD_EXPONENTIAL_BACKOFF_CONFIG` for typical use cases:

- Initial delay: 2 seconds
- Max delay: 15 seconds
- Backoff multiplier: 1.5x
- Max attempts: 20 (~4.5 minutes total)
- Jitter: 20%

## Error Handling

The poller will:

- **Re-throw domain errors**: Any error thrown by your poll function will bubble up
- **Throw PollingError on timeout**: If max attempts are exceeded, throws `PollingError` with cause `TIMEOUT`

```typescript
import { PollingError, PollingFailureCause } from '@lokalise/polling'

try {
  await poller.poll(myPollFn, reqContext)
} catch (error) {
  if (error instanceof PollingError) {
    if (error.failureCause === PollingFailureCause.TIMEOUT) {
      console.log(`Timed out after ${error.attemptsMade} attempts`)
    }
  }
}
```

## Architecture

### Strategy Pattern

The package uses a strategy pattern to allow different polling behaviors. This makes it easy to add new retry strategies without modifying existing code.

```typescript
import { PollingStrategy, type PollResult } from '@lokalise/polling'
import type { RequestContext } from '@lokalise/fastify-extras'

// Example: Create a custom strategy
class CustomStrategy implements PollingStrategy {
  async execute<T>(
    pollFn: () => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    // Your custom retry logic here
  }
}
```

### Builder Pattern

The builder pattern provides a fluent API for constructing pollers:

```typescript
const poller = createPollerBuilder()
  .withExponentialBackoff(config) // Configure strategy
  .build() // Build the poller
```

## Migration from Legacy API

If you're using the old `ExponentialBackoffPoller` class, it's still available for backward compatibility but is deprecated:

```typescript
// Old API (deprecated but still works)
import { ExponentialBackoffPoller, STANDARD_POLLER_CONFIG } from '@lokalise/polling'
const poller = new ExponentialBackoffPoller()
await poller.poll(myPollFn, STANDARD_POLLER_CONFIG, reqContext)

// New API (recommended)
import { createPollerBuilder, STANDARD_EXPONENTIAL_BACKOFF_CONFIG } from '@lokalise/polling'
const poller = createPollerBuilder()
  .withExponentialBackoff(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)
  .build()
await poller.poll(myPollFn, reqContext)
```

