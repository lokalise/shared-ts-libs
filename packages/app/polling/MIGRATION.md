# Migration Guide: v2.x → v3.0

This guide helps you migrate from `@lokalise/polling` v2.x to v3.0.

## Overview

Version 3.0 is a major release with significant improvements:
- **Universal Runtime Support**: Removes Node.js-specific dependencies, works in browsers, Deno, Bun, React Native, etc.
- **Cleaner Architecture**: Removes `metadata` parameter for better separation of concerns
- **Options-Based API**: Simplified with a single options object instead of positional parameters
- **Powerful Lifecycle Hooks**: Better observability without coupling to specific logging libraries

## Breaking Changes

### 1. Removed Node.js Dependencies

**What Changed:**
- Removed `@lokalise/node-core` peer dependency
- `PollingError` now extends plain `Error` instead of `InternalError`
- No longer requires Node.js-specific APIs

**Migration:**

```typescript
// ❌ v2.x - Required @lokalise/node-core
import { InternalError } from '@lokalise/node-core'

if (error instanceof InternalError) {
  console.log(error.errorCode)
}

// ✅ v3.0 - Use type guard instead
import { PollingError } from '@lokalise/polling'

if (PollingError.isPollingError(error)) {
  console.log(error.errorCode)
}
```

**Why:** Makes the library universal and removes unnecessary dependencies.

### 2. API Signature Changed: Options Object Pattern

**What Changed:**
The `poll()` method signature changed from positional parameters to a single options object.

**v2.x Signature:**
```typescript
poll<T>(
  pollFn: (attempt: number) => Promise<PollResult<T>>,
  reqContext: RequestContext,      // Required positional parameter
  metadata?: Record<string, unknown>,  // Optional positional parameter
  signal?: AbortSignal,            // Optional positional parameter
): Promise<T>
```

**v3.0 Signature:**
```typescript
poll<T>(
  pollFn: (attempt: number) => Promise<PollResult<T>>,
  options?: PollingOptions,  // Single optional object parameter
): Promise<T>
```

**Migration:**

```typescript
// ❌ v2.x - Positional parameters
await poller.poll(
  pollFn,
  reqContext,
  { jobId: '123' },
  controller.signal
)

// ✅ v3.0 - Options object with context captured via closures
const jobId = '123'

await poller.poll(pollFn, {
  signal: controller.signal,
  hooks: {
    onAttempt: ({ attempt }) => {
      logger.debug({ attempt, jobId }, 'Poll attempt')
    },
  },
})
```

**Why:** More flexible, easier to extend, and makes all parameters truly optional.

### 3. Removed `RequestContext` Requirement

**What Changed:**
`RequestContext` is no longer required or used. Use lifecycle hooks instead for logging and observability.

**Migration:**

```typescript
// ❌ v2.x - Required RequestContext with logger
await poller.poll(
  pollFn,
  reqContext,  // Had logger attached
  { jobId: '123' }
)

// ✅ v3.0 - Use hooks and closures
const jobId = '123'

await poller.poll(pollFn, {
  hooks: {
    onAttempt: ({ attempt, isComplete }) => {
      logger.debug({ attempt, isComplete, jobId }, 'Poll attempt')
    },
    onSuccess: ({ totalAttempts }) => {
      logger.info({ totalAttempts, jobId }, 'Polling succeeded')
    },
    onFailure: ({ cause, attemptsMade }) => {
      logger.error({ cause, attemptsMade, jobId }, 'Polling failed')
    },
  },
})
```

**Why:** Decouples the library from specific logging implementations, making it more flexible and universal.

### 4. Removed `metadata` Parameter

**What Changed:**
The `metadata` parameter has been completely removed from the API. Domain context should be captured via closures instead, and errors should be converted at application boundaries.

**Migration:**

```typescript
// ❌ v2.x - Metadata through API
await poller.poll(pollFn, reqContext, { jobId: '123', userId: 'abc' })

// ✅ v3.0 - Context via closures
const jobId = '123'
const userId = 'abc'

await poller.poll(pollFn, {
  hooks: {
    onAttempt: ({ attempt }) => {
      logger.debug({ attempt, jobId, userId }, 'Poll attempt')
    },
  },
})
```

**Why:**
- **Cleaner separation of concerns**: Polling utility stays domain-agnostic
- **Better error handling**: Converts errors at boundaries where you have context
- **Simpler API**: One less parameter to understand
- **Natural pattern**: Uses standard JavaScript closures

### 5. Removed `details` Property from `PollingError`

**What Changed:**
`PollingError` no longer has a `details` property. Convert polling errors to domain errors where you have context.

**Migration:**

```typescript
// ❌ v2.x - Relied on details in error
try {
  await poller.poll(pollFn, reqContext, { jobId: '123' })
} catch (error) {
  if (error instanceof InternalError) {
    console.log(error.details) // Had metadata
  }
}

// ✅ v3.0 - Convert to domain error with context
const jobId = '123'

try {
  await poller.poll(pollFn)
} catch (error) {
  if (PollingError.isPollingError(error)) {
    // Convert to domain error at boundary
    throw new JobProcessingError(
      `Job ${jobId} polling failed: ${error.failureCause}`,
      { 
        jobId,
        pollingAttempts: error.attemptsMade,
        cause: error 
      }
    )
  }
  throw error
}
```

**Why:** Utility errors should not carry domain-specific data; errors should be converted at boundaries.

### 6. Strategy Interface Changed

**What Changed:**
The `PollingStrategy.execute()` method signature changed to accept options object without metadata support.

**v2.x Interface:**
```typescript
interface PollingStrategy {
  execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T>
}
```

**v3.0 Interface:**
```typescript
interface PollingStrategy {
  execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T>
}
```

**Migration (Custom Strategies):**

```typescript
// ❌ v2.x - Custom strategy
class MyStrategy implements PollingStrategy {
  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    reqContext.logger.debug({ ...metadata }, 'Starting polling')
    // ... implementation
  }
}

// ✅ v3.0 - Custom strategy with hooks (no metadata)
class MyStrategy implements PollingStrategy {
  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T> {
    const { hooks, signal } = options ?? {}
    
    // Use hooks instead of direct logging
    hooks?.onAttempt?.({ attempt: 1, isComplete: false })
    
    // ... implementation
  }
}
```

**Why:** Consistent with the main API and more extensible.

### 7. Hook Signatures Changed

**What Changed:**
All hooks no longer receive `metadata` parameter.

**Migration:**

```typescript
// ❌ v2.x - Hooks received metadata
{
  hooks: {
    onAttempt: ({ attempt, isComplete, metadata }) => {
      logger.debug({ attempt, isComplete, ...metadata })
    },
  },
}

// ✅ v3.0 - Capture context from closure
const jobId = '123'

{
  hooks: {
    onAttempt: ({ attempt, isComplete }) => {
      logger.debug({ attempt, isComplete, jobId })
    },
  },
}
```

## New Features

### 1. Lifecycle Hooks

v3.0 introduces powerful lifecycle hooks for observability:

```typescript
const jobId = '123'
const userId = '456'

await poller.poll(pollFn, {
  hooks: {
    // Called after each attempt
    onAttempt: ({ attempt, isComplete }) => {
      console.log(`Attempt ${attempt}: ${isComplete ? 'Complete' : 'Pending'}`)
    },
    
    // Called before waiting between attempts
    onWait: ({ attempt, waitMs }) => {
      console.log(`Waiting ${waitMs}ms before attempt ${attempt + 1}`)
    },
    
    // Called when polling succeeds
    onSuccess: ({ totalAttempts }) => {
      metrics.increment('polling.success', { jobId })
    },
    
    // Called when polling fails
    onFailure: ({ cause, attemptsMade }) => {
      metrics.increment('polling.failure', { cause, jobId })
    },
  },
})
```

**Use Cases:**
- Logging to any logging library
- Sending metrics to monitoring systems
- Custom alerting
- Progress tracking
- A/B testing instrumentation

### 2. Type Guard for Error Checking

Recommended way to check for `PollingError`:

```typescript
// ✅ v3.0 - Type guard (recommended)
if (PollingError.isPollingError(error)) {
  console.log(error.failureCause)
}

// ✅ Also works - instanceof
if (error instanceof PollingError) {
  console.log(error.failureCause)
}
```

The type guard is preferred as it works across realms and execution contexts.

### 3. Universal Runtime Support

v3.0 works in any JavaScript runtime:
- ✅ Node.js (all versions)
- ✅ Browsers (all modern browsers)
- ✅ Deno
- ✅ Bun
- ✅ React Native
- ✅ Cloudflare Workers
- ✅ Any JavaScript environment

No runtime-specific APIs are used.

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
npm install @lokalise/polling@^3.0.0
npm uninstall @lokalise/node-core  # No longer needed as peer dependency
```

### Step 2: Update Poll Calls

Replace all `poll()` calls:

```typescript
// Before (v2.x)
await poller.poll(pollFn, reqContext)
await poller.poll(pollFn, reqContext, metadata)
await poller.poll(pollFn, reqContext, metadata, signal)

// After (v3.0)
await poller.poll(pollFn)
await poller.poll(pollFn, { signal })
// Capture context via closures instead of metadata
```

### Step 3: Replace Logging with Hooks and Closures

If you were relying on automatic logging:

```typescript
// Before (v2.x)
await poller.poll(pollFn, reqContext, { jobId: '123' })
// Automatic logging via reqContext.logger

// After (v3.0)
const jobId = '123'

await poller.poll(pollFn, {
  hooks: {
    onAttempt: ({ attempt, isComplete }) => {
      logger.debug({ attempt, isComplete, jobId }, 'Poll attempt')
    },
    onSuccess: ({ totalAttempts }) => {
      logger.info({ totalAttempts, jobId }, 'Polling succeeded')
    },
  },
})
```

### Step 4: Update Error Handling

```typescript
// Before (v2.x)
try {
  await poller.poll(pollFn, reqContext, { jobId: '123' })
} catch (error) {
  if (error instanceof InternalError) {
    console.log(error.errorCode)
  }
}

// After (v3.0)
const jobId = '123'

try {
  await poller.poll(pollFn)
} catch (error) {
  if (PollingError.isPollingError(error)) {
    // Convert to domain error with context
    throw new JobProcessingError(
      `Job ${jobId} polling failed: ${error.failureCause}`,
      { jobId, attempts: error.attemptsMade, cause: error }
    )
  }
}
```

### Step 5: Update Custom Strategies (if any)

```typescript
// Before (v2.x)
class CustomStrategy implements PollingStrategy {
  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Implementation
  }
}

// After (v3.0)
class CustomStrategy implements PollingStrategy {
  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T> {
    const { hooks, signal } = options ?? {}
    // Implementation with hooks (no metadata)
  }
}
```

## Complete Example: Before and After

### Before (v2.x)

```typescript
import { Poller, ExponentialBackoffStrategy, STANDARD_EXPONENTIAL_BACKOFF_CONFIG } from '@lokalise/polling'

async function processJob(jobId: string, reqContext: RequestContext) {
  const strategy = new ExponentialBackoffStrategy(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)
  const poller = new Poller(strategy)

  return await poller.poll(
    async (attempt) => {
      const status = await checkJobStatus(jobId)
      if (status === 'completed') {
        return { isComplete: true, value: await getJobResult(jobId) }
      }
      return { isComplete: false }
    },
    reqContext,  // Required
    { jobId },   // Metadata
  )
}
```

### After (v3.0)

```typescript
import { Poller, ExponentialBackoffStrategy, STANDARD_EXPONENTIAL_BACKOFF_CONFIG, PollingError } from '@lokalise/polling'

async function processJob(jobId: string) {
  const strategy = new ExponentialBackoffStrategy(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)
  const poller = new Poller(strategy)

  try {
    return await poller.poll(
      async (attempt) => {
        const status = await checkJobStatus(jobId)
        if (status === 'completed') {
          return { isComplete: true, value: await getJobResult(jobId) }
        }
        return { isComplete: false }
      },
      {
        hooks: {
          // Context captured from closure
          onAttempt: ({ attempt }) => {
            logger.debug({ attempt, jobId }, 'Polling')
          },
          onFailure: ({ cause }) => {
            logger.error({ cause, jobId }, 'Failed')
          },
        },
      },
    )
  } catch (error) {
    // Convert utility error to domain error at boundary
    if (PollingError.isPollingError(error)) {
      throw new JobProcessingError(
        `Job ${jobId} polling ${error.failureCause.toLowerCase()}`,
        { jobId, attempts: error.attemptsMade, cause: error }
      )
    }
    throw error
  }
}
```

## Quick Reference

### Import Changes

```typescript
// v2.x
import { 
  Poller, 
  PollingError,
  type RequestContext  // ❌ Removed
} from '@lokalise/polling'
import { InternalError } from '@lokalise/node-core'  // ❌ No longer needed

// v3.0
import { 
  Poller, 
  PollingError,
  type PollingOptions,  // ✅ New
  type PollingHooks,    // ✅ New
} from '@lokalise/polling'
```

### Common Patterns

| Use Case | v2.x | v3.0 |
|----------|------|------|
| Basic poll | `poll(fn, ctx)` | `poll(fn)` |
| With context | `poll(fn, ctx, meta)` | Capture via closures |
| With signal | `poll(fn, ctx, meta, sig)` | `poll(fn, { signal: sig })` |
| With logging | Automatic via `ctx.logger` | `poll(fn, { hooks: { onAttempt: ... } })` |
| Error check | `error instanceof InternalError` | `PollingError.isPollingError(error)` |
| Error context | `error.details.metadata` | Convert to domain error with context |

## Compatibility Notes

- **Minimum Node.js version**: No longer tied to Node.js versions
- **TypeScript**: Requires TypeScript 4.5+ (same as v2.x)
- **Breaking changes**: Yes (major version bump)
- **Runtime compatibility**: Universal (works everywhere JavaScript runs)

## Benefits of v3.0

1. **Universal Runtime Support**: Works in browsers, Deno, Bun, React Native, etc.
2. **Cleaner Architecture**: Clear separation between utility and domain concerns
3. **Better Error Handling**: Forces proper error conversion at boundaries
4. **Simpler API**: Fewer parameters, more flexible
5. **More Idiomatic**: Uses standard JavaScript patterns (closures)
6. **Better Observability**: Flexible hooks without coupling to specific libraries

## Need Help?

- [Full Documentation](./README.md)
- [API Reference](./README.md#api-reference)
- [Examples](./README.md#usage-examples)
- [GitHub Issues](https://github.com/lokalise/shared-ts-libs/issues)

## Summary

v3.0 is a cleaner, more flexible, and universal version of the library with these key changes:

1. ✅ Remove Node.js dependencies (universal runtime support)
2. ✅ Remove positional parameters, use options object
3. ✅ Remove `RequestContext` requirement
4. ✅ Remove `metadata` parameter (use closures)
5. ✅ Convert errors at boundaries (better architecture)
6. ✅ Use `PollingError.isPollingError()` type guard
7. ✅ Update custom strategies (if any)

The result is a more maintainable, universal codebase with better separation of concerns and wider runtime compatibility.
