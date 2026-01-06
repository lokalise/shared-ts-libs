# Migration Guide: v2.x → v3.0

This guide helps you migrate from `@lokalise/polling` v2.x to v3.0.

## Overview

Version 3.0 is a major release that removes Node.js-specific dependencies, making the library universal (works in Node.js, browsers, Deno, Bun, React Native, etc.). The API has been simplified with a cleaner options-based approach and adds powerful lifecycle hooks for observability.

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

// ✅ v3.0 - Options object
await poller.poll(pollFn, {
  metadata: { jobId: '123' },
  signal: controller.signal,
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

// ✅ v3.0 - Use hooks for logging
await poller.poll(pollFn, {
  metadata: { jobId: '123' },
  hooks: {
    onAttempt: ({ attempt, isComplete, metadata }) => {
      logger.debug({ attempt, isComplete, ...metadata }, 'Poll attempt')
    },
    onSuccess: ({ totalAttempts, metadata }) => {
      logger.info({ totalAttempts, ...metadata }, 'Polling succeeded')
    },
    onFailure: ({ cause, attemptsMade, metadata }) => {
      logger.error({ cause, attemptsMade, ...metadata }, 'Polling failed')
    },
  },
})
```

**Why:** Decouples the library from specific logging implementations, making it more flexible and universal.

### 4. Strategy Interface Changed

**What Changed:**
The `PollingStrategy.execute()` method signature changed to accept options object.

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

// ✅ v3.0 - Custom strategy with hooks
class MyStrategy implements PollingStrategy {
  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T> {
    const { hooks, metadata, signal } = options ?? {}
    
    // Use hooks instead of direct logging
    hooks?.onAttempt?.({ attempt: 1, isComplete: false, metadata })
    
    // ... implementation
  }
}
```

**Why:** Consistent with the main API and more extensible.

## New Features

### 1. Lifecycle Hooks

v3.0 introduces powerful lifecycle hooks for observability:

```typescript
await poller.poll(pollFn, {
  metadata: { jobId: '123', userId: '456' },
  hooks: {
    // Called after each attempt
    onAttempt: ({ attempt, isComplete, metadata }) => {
      console.log(`Attempt ${attempt}: ${isComplete ? 'Complete' : 'Pending'}`)
    },
    
    // Called before waiting between attempts
    onWait: ({ attempt, waitMs, metadata }) => {
      console.log(`Waiting ${waitMs}ms before attempt ${attempt + 1}`)
    },
    
    // Called when polling succeeds
    onSuccess: ({ totalAttempts, metadata }) => {
      metrics.increment('polling.success')
    },
    
    // Called when polling fails
    onFailure: ({ cause, attemptsMade, metadata }) => {
      metrics.increment('polling.failure', { cause })
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
await poller.poll(pollFn, { metadata })
await poller.poll(pollFn, { metadata, signal })
```

### Step 3: Replace Logging with Hooks

If you were relying on automatic logging:

```typescript
// Before (v2.x)
await poller.poll(pollFn, reqContext, { jobId: '123' })
// Automatic logging via reqContext.logger

// After (v3.0)
await poller.poll(pollFn, {
  metadata: { jobId: '123' },
  hooks: {
    onAttempt: ({ attempt, isComplete, metadata }) => {
      logger.debug({ attempt, isComplete, ...metadata }, 'Poll attempt')
    },
    onSuccess: ({ totalAttempts, metadata }) => {
      logger.info({ totalAttempts, ...metadata }, 'Polling succeeded')
    },
  },
})
```

### Step 4: Update Error Handling

```typescript
// Before (v2.x)
try {
  await poller.poll(pollFn, reqContext)
} catch (error) {
  if (error instanceof InternalError) {
    console.log(error.errorCode)
  }
}

// After (v3.0)
try {
  await poller.poll(pollFn)
} catch (error) {
  if (PollingError.isPollingError(error)) {
    console.log(error.errorCode)
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
    const { hooks, metadata, signal } = options ?? {}
    // Implementation with hooks
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
| With metadata | `poll(fn, ctx, meta)` | `poll(fn, { metadata: meta })` |
| With signal | `poll(fn, ctx, meta, sig)` | `poll(fn, { metadata: meta, signal: sig })` |
| With logging | Automatic via `ctx.logger` | `poll(fn, { hooks: { onAttempt: ... } })` |
| Error check | `error instanceof InternalError` | `PollingError.isPollingError(error)` |

## Compatibility Notes

- **Minimum Node.js version**: No longer tied to Node.js versions
- **TypeScript**: Requires TypeScript 4.5+ (same as v2.x)
- **Breaking changes**: Yes (major version bump)
- **Runtime compatibility**: Universal (works everywhere JavaScript runs)

## Need Help?

- [Full Documentation](./README.md)
- [API Reference](./README.md#api-reference)
- [Examples](./README.md#usage-examples)
- [GitHub Issues](https://github.com/lokalise/shared-ts-libs/issues)

## Summary

v3.0 is a cleaner, more flexible, and universal version of the library. The migration effort is minimal for most use cases:

1. ✅ Remove positional parameters, use options object
2. ✅ Replace `reqContext` usage with hooks
3. ✅ Use `PollingError.isPollingError()` type guard
4. ✅ Update custom strategies (if any)

The result is a more maintainable codebase with better observability and wider runtime compatibility.
