# Polling

This package provides polling utilities with exponential backoff support.

## Features

- **Exponential Backoff**: Automatically increases delay between polling attempts
- **Jitter Support**: Adds randomization to prevent thundering herd problems
- **Configurable**: Fully customizable polling behavior
- **Type-Safe**: Full TypeScript support with strict types
- **Error Handling**: Domain-specific error handling with timeout support

## Usage

### Basic Example

```typescript
import {
  ExponentialBackoffPoller,
  STANDARD_POLLER_CONFIG,
  type PollResult,
} from '@lokalise/polling'
import type { RequestContext } from '@lokalise/fastify-extras'

const poller = new ExponentialBackoffPoller()

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
    STANDARD_POLLER_CONFIG,
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
import { ExponentialBackoffPoller, type PollerConfig } from '@lokalise/polling'

const customConfig: PollerConfig = {
  initialDelayMs: 1000, // Start with 1 second
  maxDelayMs: 30000, // Cap at 30 seconds
  backoffMultiplier: 2.0, // Double the delay each time
  maxAttempts: 10, // Maximum 10 attempts
  jitterFactor: 0.1, // 10% jitter
}

const poller = new ExponentialBackoffPoller()
await poller.poll(myPollFn, customConfig, reqContext)
```

## Configuration Options

- `initialDelayMs`: Initial delay between attempts (milliseconds)
- `maxDelayMs`: Maximum delay between attempts (milliseconds)
- `backoffMultiplier`: Multiplier applied to delay after each attempt
- `maxAttempts`: Maximum number of polling attempts before timeout
- `jitterFactor`: Randomization factor (0-1) to prevent synchronized requests

## Standard Config

The package includes `STANDARD_POLLER_CONFIG` for typical use cases:

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
  await poller.poll(myPollFn, config, reqContext)
} catch (error) {
  if (error instanceof PollingError) {
    if (error.failureCause === PollingFailureCause.TIMEOUT) {
      console.log(`Timed out after ${error.attemptsMade} attempts`)
    }
  }
}
```

