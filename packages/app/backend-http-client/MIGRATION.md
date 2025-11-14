# Migration Guide

## Version 10.0.0

### New Features

This release introduces streaming response support for GET requests, allowing memory-efficient processing of large response bodies.

#### Added Methods

- `sendGetWithStreamedResponse()` - Direct path-based GET requests with streamed responses
- `sendByGetRouteWithStreamedResponse()` - API contract-based GET requests with streamed responses

These methods use `sendWithRetryReturnStream` under the hood to return a `Readable` stream instead of consuming the entire response body.

#### Breaking Changes

#### Retry Configuration API Change

**What changed:** The `retryConfig` option now uses `delayResolver` function instead of `delayBetweenAttemptsInMsecs` number.

**Reason:** Updated to undici-retry v7, which provides more flexible retry delay calculation through a function-based approach.

**Before (v9.x and earlier):**
```ts
const result = await sendGet(client, '/api/data', {
  responseSchema: mySchema,
  requestLabel: 'Fetch data',
  retryConfig: {
    maxAttempts: 3,
    delayBetweenAttemptsInMsecs: 1000,  // ❌ No longer supported
    statusCodesToRetry: [500, 502, 503],
    retryOnTimeout: true,
  },
})
```

**After (v9.0.0+):**
```ts
import { sendGet, createDefaultRetryResolver } from '@lokalise/backend-http-client'

const result = await sendGet(client, '/api/data', {
  responseSchema: mySchema,
  requestLabel: 'Fetch data',
  retryConfig: {
    maxAttempts: 3,
    delayResolver: createDefaultRetryResolver({
        baseDelay: 1000,
        maxDelay: 1000,
    }),  // ✅ Use resolver-based approach
    statusCodesToRetry: [500, 502, 503],
    retryOnTimeout: true,
  },
})
```

**Migration steps:**

1. If you weren't using `retryConfig`, no changes needed
2. If you were using default retry behavior (maxAttempts: 1), no changes needed
3. If you were using `delayBetweenAttemptsInMsecs`:
    - Import `createDefaultRetryResolver` from '@lokalise/backend-http-client' (or 'undici-retry')
    - Replace `delayBetweenAttemptsInMsecs: X` with `delayResolver: createDefaultRetryResolver({ delayMs: X })`
    - Or implement a custom delay resolver function

**Custom delay resolver example:**
```ts
const result = await sendGet(client, '/api/data', {
  responseSchema: mySchema,
  requestLabel: 'Fetch data',
  retryConfig: {
    maxAttempts: 3,
    delayResolver: (response, attemptNumber, statusCodesToRetry) => {
      // Exponential backoff
      return Math.pow(2, attemptNumber) * 1000
    },
    statusCodesToRetry: [500, 502, 503],
    retryOnTimeout: true,
  },
})
```

**RetryConfig Type:**
```ts
type RetryConfig = {
  maxAttempts: number
  delayResolver?: (response: ResponseData, attemptNumber: number, statusCodesToRetry: readonly number[]) => number | undefined
  statusCodesToRetry?: readonly number[]
  retryOnTimeout: boolean
}
```


#### Usage Changes

If you need to process large response bodies without loading them entirely into memory, you can now use the new streaming methods:

**Before (loads entire response into memory):**
```ts
const result = await sendByGetRoute(
  client,
  largeFileRouteDefinition,
  { pathParams: { fileId: '12345' } },
  { requestLabel: 'Download file' }
)

// result.result.body contains the entire response in memory
const data = result.result.body
```

**After (streams response for memory efficiency):**
```ts
const result = await sendByGetRouteWithStreamedResponse(
  client,
  largeFileRouteDefinition,
  { pathParams: { fileId: '12345' } },
  { requestLabel: 'Download file' }
)

// result.result.body is a Readable stream
if (result.result) {
  for await (const chunk of result.result.body) {
    // Process chunk by chunk
  }
}
```

#### Important Limitations

The streaming methods have intentional limitations to ensure proper usage:

1. **No response validation** - `validateResponse` is not supported for streamed responses
2. **No schema parsing** - `responseSchema` is not part of the options (the response is always a `Readable` stream)
3. **No automatic JSON parsing** - The response body is returned as a raw stream
4. **Mandatory body consumption** - You MUST fully consume or explicitly dump the response body

#### Critical Warning: Body Consumption

**Failing to consume the response body will cause connection leaks!**

According to the undici documentation, garbage collection in Node.js is less aggressive than in browsers, which means leaving connection resources to the garbage collector can lead to:
- Excessive connection usage
- Reduced performance (less connection re-use)
- Stalls or deadlocks when running out of connections

**You MUST either:**
1. Fully consume the response body by reading all chunks
2. Explicitly dump the body using `await body.dump()`

```ts
// ✓ GOOD - Consume the entire stream
for await (const chunk of result.result.body) {
  processChunk(chunk)
}

// ✓ GOOD - Pipe to another stream
result.result.body.pipe(writeStream)

// ✓ GOOD - Dump if not needed
await result.result.body.dump()

// ✗ BAD - CONNECTION LEAK!
const { headers } = result.result
// Never consumed body = connection leak
```

#### Migration Steps

No migration steps are required. The new methods are additive and do not affect existing code.

If you want to adopt streaming for large file downloads or data processing:

1. Identify GET requests that handle large response bodies
2. Replace `sendGet` with `sendGetWithStreamedResponse` or `sendByGetRoute` with `sendByGetRouteWithStreamedResponse`
3. Update response handling to process the stream instead of accessing a parsed body
4. Remove `validateResponse`, `responseSchema`, `safeParseJson`, and `blobResponseBody` from options (not supported in streaming mode)

#### Examples

**Streaming to a file:**
```ts
import { createWriteStream } from 'node:fs'

const result = await sendByGetRouteWithStreamedResponse(
  client,
  downloadRouteDefinition,
  { pathParams: { fileId: '12345' } },
  { requestLabel: 'Download file' }
)

if (result.result) {
  const writeStream = createWriteStream('/path/to/file')
  result.result.body.pipe(writeStream)
}
```

**Processing chunks:**
```ts
const result = await sendGetWithStreamedResponse(
  client,
  '/api/large-dataset',
  {
    requestLabel: 'Process dataset',
  }
)

if (result.result) {
  for await (const chunk of result.result.body) {
    // Process each chunk
    await processChunk(chunk)
  }
}
```

**With retry configuration:**
```ts
const result = await sendByGetRouteWithStreamedResponse(
  client,
  routeDefinition,
  { pathParams: { id: '123' } },
  {
    requestLabel: 'Download with retry',
    retryConfig: {
      maxAttempts: 3,
      statusCodesToRetry: [500, 502, 503],
      retryOnTimeout: true,
    },
  }
)
```
