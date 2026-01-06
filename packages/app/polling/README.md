# @lokalise/polling

A flexible, production-ready polling library with configurable retry strategies and TypeScript support.

## Features

- 🔄 **Flexible Strategy Pattern** - Easy to extend with custom polling strategies
- ⏱️ **Exponential Backoff** - Built-in exponential backoff with jitter to prevent thundering herd
- 🎯 **Type-Safe** - Full TypeScript support with discriminated unions
- 🚫 **Cancellable** - Support for AbortSignal to cancel polling operations
- 🪝 **Observable** - Lifecycle hooks for logging, metrics, and monitoring
- 🌍 **Universal** - Works in Node.js, browsers, Deno, Bun, and React Native
- ⚡ **Production-Ready** - Input validation, error handling, and configurable timeouts
- 🪶 **Zero Dependencies** - No external runtime dependencies

## Installation

```bash
npm install @lokalise/polling
```

## Quick Start

```typescript
import { Poller, ExponentialBackoffStrategy, STANDARD_EXPONENTIAL_BACKOFF_CONFIG } from '@lokalise/polling'

// Create a poller with exponential backoff strategy
const strategy = new ExponentialBackoffStrategy(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)
const poller = new Poller(strategy)

// Poll until complete
const jobId = 'job-123' // Your domain context

const result = await poller.poll(
  async (attempt) => {
    const status = await checkJobStatus(jobId)
    
    if (status === 'completed') {
      return { isComplete: true, value: await getJobResult(jobId) }
    }
    
    return { isComplete: false }
  },
  {
    hooks: {
      onAttempt: ({ attempt, isComplete }) => 
        console.log(`[${jobId}] Attempt ${attempt}: ${isComplete ? 'Complete' : 'Continuing'}`),
    },
  },
)
```

## Core Concepts

### PollResult

A discriminated union that represents the result of a polling attempt:

```typescript
type PollResult<T> = 
  | { isComplete: true; value: T }   // Polling succeeded, return the value
  | { isComplete: false }             // Not ready yet, keep polling
```

### Poll Function

Your poll function receives the current attempt number (1-based) and should:
1. Check if the operation is complete
2. Return `{ isComplete: true, value }` if done
3. Return `{ isComplete: false }` if not ready
4. Throw domain-specific errors for terminal failures

```typescript
async (attempt: number) => {
  console.log(`Attempt ${attempt}`)
  
  const status = await checkStatus()
  
  if (status === 'failed') {
    // Terminal error - stop polling immediately
    throw new Error('Operation failed permanently')
  }
  
  if (status === 'completed') {
    return { isComplete: true, value: await getResult() }
  }
  
  // Still processing - continue polling
  return { isComplete: false }
}
```

## Strategies

### ExponentialBackoffStrategy

Implements exponential backoff with optional jitter to prevent request clustering.

#### Configuration

```typescript
interface ExponentialBackoffConfig {
  initialDelayMs: number      // Starting delay (must be >= 0)
  maxDelayMs: number          // Maximum delay cap (must be >= initialDelayMs)
  backoffMultiplier: number   // Exponential growth factor (must be > 0)
  maxAttempts: number         // Maximum polling attempts (must be >= 1)
  jitterFactor?: number       // Randomization factor 0-1 (default: 0.2)
}
```

#### Standard Configuration

The library provides a sensible default configuration:

```typescript
const STANDARD_EXPONENTIAL_BACKOFF_CONFIG = {
  initialDelayMs: 2000,       // Start with 2 seconds
  maxDelayMs: 15000,          // Cap at 15 seconds
  backoffMultiplier: 1.5,     // Increase by 50% each time
  maxAttempts: 20,            // Try up to 20 times (~4.5 min total)
  jitterFactor: 0.2,          // ±20% randomization
}
```

#### How Delays Are Calculated

1. **Base delay**: `initialDelayMs × backoffMultiplier^(attempt-1)`
2. **Capped**: `min(baseDelay, maxDelayMs)`
3. **Jittered**: `baseDelay + (baseDelay × jitterFactor × random(-0.5 to 0.5))`
4. **Ensured positive**: `max(0, jitteredDelay)`

Example progression with standard config:
- Attempt 1: Poll immediately (no delay)
- Attempt 2: Wait ~2s (2000ms ± 20%)
- Attempt 3: Wait ~3s (3000ms ± 20%)
- Attempt 4: Wait ~4.5s (4500ms ± 20%)
- Attempt 5: Wait ~6.8s (6750ms ± 20%)
- ...continues until maxDelayMs...
- Attempt 10+: Wait ~15s (15000ms ± 20%)

#### Custom Configuration Examples

**Quick polling for fast operations:**
```typescript
const quickConfig = {
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  maxAttempts: 10,
  jitterFactor: 0.1,
}
```

**Patient polling for slow operations:**
```typescript
const patientConfig = {
  initialDelayMs: 5000,
  maxDelayMs: 60000,
  backoffMultiplier: 1.3,
  maxAttempts: 50,
  jitterFactor: 0.3,
}
```

**Fixed interval (no backoff):**
```typescript
const fixedConfig = {
  initialDelayMs: 3000,
  maxDelayMs: 3000,
  backoffMultiplier: 1,  // No growth
  maxAttempts: 20,
  jitterFactor: 0,       // No jitter
}
```

## Usage Examples

### Basic Polling

```typescript
import { Poller, ExponentialBackoffStrategy, STANDARD_EXPONENTIAL_BACKOFF_CONFIG } from '@lokalise/polling'

const strategy = new ExponentialBackoffStrategy(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)
const poller = new Poller(strategy)

const result = await poller.poll(
  async (attempt) => {
    const data = await fetchData()
    return data.ready 
      ? { isComplete: true, value: data.result }
      : { isComplete: false }
  },
)
```

### With Lifecycle Hooks

Use hooks to observe polling lifecycle events for logging, metrics, or monitoring:

```typescript
const jobId = 'job-123'
const userId = 'user-456'

const result = await poller.poll(
  async (attempt) => {
    const status = await checkJobStatus(jobId)
    return status === 'done'
      ? { isComplete: true, value: await getResult(jobId) }
      : { isComplete: false }
  },
  {
    hooks: {
      onAttempt: ({ attempt, isComplete }) => {
        console.log(`[${jobId}] Attempt ${attempt}: ${isComplete ? 'Complete' : 'Pending'}`)
      },
      onWait: ({ attempt, waitMs }) => {
        console.log(`[${jobId}] Waiting ${waitMs}ms before attempt ${attempt + 1}`)
      },
      onSuccess: ({ totalAttempts }) => {
        console.log(`[${jobId}] Succeeded after ${totalAttempts} attempts`)
      },
      onFailure: ({ cause, attemptsMade }) => {
        console.error(`[${jobId}] Failed: ${cause} after ${attemptsMade} attempts`)
      },
    },
  },
)
```

### With Cancellation (AbortSignal)

```typescript
const controller = new AbortController()

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000)

try {
  const result = await poller.poll(
    async (attempt) => {
      const status = await checkStatus()
      return status === 'ready'
        ? { isComplete: true, value: status.data }
        : { isComplete: false }
    },
    {
      signal: controller.signal,  // Pass the signal
    },
  )
} catch (error) {
  if (error instanceof PollingError && error.failureCause === 'CANCELLED') {
    console.log('Polling was cancelled')
  }
}
```

### Using Attempt Number

```typescript
const result = await poller.poll(
  async (attempt) => {
    console.log(`Polling attempt ${attempt}`)
    
    // Maybe adjust behavior based on attempt
    const timeout = attempt > 5 ? 10000 : 5000
    
    const status = await checkStatus({ timeout })
    return status.complete
      ? { isComplete: true, value: status.data }
      : { isComplete: false }
  },
)
```

### Handling Terminal Errors

```typescript
const jobId = 'job-123'

try {
  const result = await poller.poll(
    async (attempt) => {
      const status = await checkJobStatus(jobId)
      
      // Terminal failure - throw immediately
      if (status === 'failed') {
        throw new Error('Job processing failed permanently')
      }
      
      // Success
      if (status === 'completed') {
        return { isComplete: true, value: await getJobResult(jobId) }
      }
      
      // Still processing
      return { isComplete: false }
    },
  )
} catch (error) {
  if (error instanceof PollingError) {
    // Timeout or cancellation from polling library
    console.log(`Polling failed: ${error.failureCause} after ${error.attemptsMade} attempts`)
    
    // Convert to domain error with context
    throw new JobProcessingError(
      `Job ${jobId} polling timed out`,
      { jobId, cause: error }
    )
  } else {
    // Domain-specific error (job failed, network error, etc.)
    console.log('Operation failed:', error)
    throw new JobProcessingError(
      `Job ${jobId} failed`,
      { jobId, cause: error }
    )
  }
}
```

### Custom Strategy

Implement the `PollingStrategy` interface to create your own strategy:

```typescript
import type { PollingStrategy, PollResult, PollingOptions } from '@lokalise/polling'
import { PollingError, PollingFailureCause } from '@lokalise/polling'
import { delay } from '@lokalise/polling/utils/delay'

class FixedIntervalStrategy implements PollingStrategy {
  constructor(
    private readonly intervalMs: number,
    private readonly maxAttempts: number
  ) {}

  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T> {
    const { hooks, signal } = options ?? {}
    
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (signal?.aborted) {
        const error = new PollingError(
          `Polling cancelled after ${attempt - 1} attempts`,
          PollingFailureCause.CANCELLED,
          attempt - 1,
        )
        hooks?.onFailure?.({
          cause: PollingFailureCause.CANCELLED,
          attemptsMade: attempt - 1,
        })
        throw error
      }

      const result = await pollFn(attempt)
      
      hooks?.onAttempt?.({
        attempt,
        isComplete: result.isComplete,
      })
      
      if (result.isComplete) {
        hooks?.onSuccess?.({ totalAttempts: attempt })
        return result.value
      }

      if (attempt < this.maxAttempts) {
        hooks?.onWait?.({ attempt, waitMs: this.intervalMs })
        await delay(this.intervalMs, signal)
      }
    }

    const error = new PollingError(
      `Polling timeout after ${this.maxAttempts} attempts`,
      PollingFailureCause.TIMEOUT,
      this.maxAttempts,
    )
    hooks?.onFailure?.({
      cause: PollingFailureCause.TIMEOUT,
      attemptsMade: this.maxAttempts,
    })
    throw error
  }
}

// Use it
const strategy = new FixedIntervalStrategy(5000, 10)
const poller = new Poller(strategy)
```

## Error Handling

### PollingError

The library throws `PollingError` (extends `Error`) for polling-specific failures:

```typescript
class PollingError extends Error {
  readonly failureCause: 'TIMEOUT' | 'CANCELLED' | 'INVALID_CONFIG'
  readonly attemptsMade: number
  readonly errorCode: 'POLLING_TIMEOUT' | 'POLLING_CANCELLED' | 'POLLING_INVALID_CONFIG'
  
  constructor(
    message: string,
    failureCause: PollingFailureCause,
    attemptsMade: number,
    originalError?: Error,
  )

  // Type guard for error checking
  static isPollingError(error: unknown): error is PollingError
}
```

**Failure causes:**
- `TIMEOUT` - Max attempts exceeded without completion
- `CANCELLED` - AbortSignal triggered during polling
- `INVALID_CONFIG` - Strategy configuration validation failed

**Error properties:**
- `failureCause` - Discriminator: `'TIMEOUT'`, `'CANCELLED'`, or `'INVALID_CONFIG'`
- `attemptsMade` - Number of attempts completed before failure
- `errorCode` - Structured error code (e.g., `'POLLING_TIMEOUT'`)

### Error Handling Pattern

```typescript
import { PollingError, PollingFailureCause } from '@lokalise/polling'

const jobId = 'job-123'

try {
  const result = await poller.poll(pollFn)
} catch (error) {
  if (PollingError.isPollingError(error)) {
    switch (error.failureCause) {
      case PollingFailureCause.TIMEOUT:
        console.log(`Timed out after ${error.attemptsMade} attempts`)
        console.log('Error code:', error.errorCode) // 'POLLING_TIMEOUT'
        // Convert to domain error
        throw new JobTimeoutError(`Job ${jobId} timed out`, { jobId, cause: error })
      case PollingFailureCause.CANCELLED:
        console.log(`Cancelled after ${error.attemptsMade} attempts`)
        console.log('Error code:', error.errorCode) // 'POLLING_CANCELLED'
        break
      case PollingFailureCause.INVALID_CONFIG:
        console.log('Invalid strategy configuration:', error.message)
        console.log('Error code:', error.errorCode) // 'POLLING_INVALID_CONFIG'
        break
    }
  } else {
    // Domain-specific error from pollFn
    console.log('Operation failed:', error)
  }
}
```

## Observability

### Lifecycle Hooks

The library provides lifecycle hooks for observing polling events. This is ideal for integrating with your logging, metrics, or monitoring systems:

```typescript
const jobId = 'job-123'
const userId = 'user-456'

const result = await poller.poll(pollFn, {
  hooks: {
    // Called after each attempt
    onAttempt: ({ attempt, isComplete }) => {
      logger.debug({ attempt, isComplete, jobId, userId }, 'Poll attempt completed')
    },
    
    // Called before waiting between attempts
    onWait: ({ attempt, waitMs }) => {
      logger.debug({ attempt, waitMs, jobId }, 'Waiting before next attempt')
    },
    
    // Called when polling succeeds
    onSuccess: ({ totalAttempts }) => {
      logger.info({ totalAttempts, jobId }, 'Polling completed successfully')
      metrics.increment('polling.success', { job: jobId })
    },
    
    // Called when polling fails
    onFailure: ({ cause, attemptsMade }) => {
      logger.error({ cause, attemptsMade, jobId }, 'Polling failed')
      metrics.increment('polling.failure', { cause, job: jobId })
    },
  },
})
```

All hooks are optional - provide only the ones you need. Domain context (like `jobId`, `userId`) is captured via closures from your surrounding scope.

## Best Practices

1. **Choose appropriate timeouts**: Consider your operation's typical duration and set `maxAttempts` accordingly
2. **Capture context via closures**: Use closures to capture domain context (jobId, userId, etc.) rather than passing it through the API
3. **Convert errors at boundaries**: Convert `PollingError` to your domain errors where you have context
4. **Implement hooks**: Use lifecycle hooks for logging, metrics, and monitoring
5. **Handle terminal errors**: Throw errors from `pollFn` for failures that shouldn't retry
6. **Enable jitter**: Keep `jitterFactor` enabled (default 0.2) to prevent request clustering
7. **Support cancellation**: Pass `AbortSignal` for long-running operations that users might cancel
8. **Use type guards**: Prefer `PollingError.isPollingError()` over `instanceof` for better cross-realm compatibility

## API Reference

### Poller

```typescript
class Poller {
  constructor(strategy: PollingStrategy)
  
  poll<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T>
}
```

### ExponentialBackoffStrategy

```typescript
class ExponentialBackoffStrategy implements PollingStrategy {
  constructor(config: ExponentialBackoffConfig)
  
  execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T>
}
```

### Types

```typescript
type PollResult<T> = 
  | { isComplete: true; value: T }
  | { isComplete: false }

interface PollingOptions {
  /** Optional lifecycle hooks for observability */
  hooks?: PollingHooks
  /** Optional AbortSignal to cancel polling */
  signal?: AbortSignal
}

interface PollingHooks {
  /** Called after each poll attempt completes (regardless of result) */
  onAttempt?: (context: {
    attempt: number
    isComplete: boolean
  }) => void

  /** Called before waiting/delaying between attempts */
  onWait?: (context: {
    attempt: number
    waitMs: number
  }) => void

  /** Called when polling completes successfully */
  onSuccess?: (context: { 
    totalAttempts: number
  }) => void

  /** Called when polling fails (timeout or cancellation) */
  onFailure?: (context: {
    cause: PollingFailureCause
    attemptsMade: number
  }) => void
}

interface ExponentialBackoffConfig {
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  maxAttempts: number
  jitterFactor?: number
}

interface PollingStrategy {
  execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T>
}
```

## License

Apache-2.0
