# Frontend HTTP client

Opinionated HTTP client for the frontend.

Note that it is a ESM-only package.

## Basic usage

```ts
import wretch from 'wretch'
import { z } from 'zod/v4'

const client = wretch('http://localhost:8000')

const queryParamsSchema = z.object({
	param1: z.string(),
	param2: z.number(),
})

const requestBodySchema = z.object({
	requestCode: z.number(),
})

const responseBodySchema = z.object({
	success: z.boolean(),
})

const responseBody = await sendPost(client, {
	path: '/',
	body: { requestCode: 100 },
	queryParams: { param1: 'test', param2: 123 },
	queryParamsSchema,
	requestBodySchema,
	responseBodySchema,
})
```

### No content response handling (HTTP 204)

SDK methods has a parameter (`isEmptyResponseExpected`) to specify if 204 response should be treated as an error or not. By default it is treated as
valid except on `sendGet` method where it is treated as an error. Usage example:

```ts
const response = await sendGet(client, {
	path: '/',
	isEmptyResponseExpected: true,
})
```

if `204` responses are expected, the library will return null, if not, it will throw an error.

### Non-JSON response handling

SDK methods has a parameter (`isNonJSONResponseExpected`) to specify if non json responses should be treated as an error
or not. By default it is treated as valid except on `sendGet` method where it is treated as an error. Usage example:

```ts
const response = await sendGet(client, {
	path: '/',
	isNonJSONResponseExpected: true,
})
```

if non-JSON responses are expected, the library will return null, if not, it will throw an error.

### Contract-based requests

Use `sendByRouteContract` with contracts defined via `defineRouteContract` from `@lokalise/api-contracts`. All request and response types are inferred from the contract.

```ts
import { defineRouteContract, ContractNoBody } from '@lokalise/api-contracts'
import { sendByRouteContract } from '@lokalise/frontend-http-client'
import wretch from 'wretch'
import { z } from 'zod/v4'

const getUser = defineRouteContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 200: z.object({ id: z.string(), name: z.string() }) },
})

const createUser = defineRouteContract({
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responseSchemasByStatusCode: { 201: z.object({ id: z.string(), name: z.string() }) },
})

const deleteUser = defineRouteContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 204: ContractNoBody },
})

const client = wretch('https://api.example.com')

// GET — body absent from params, response typed from contract
const user = await sendByRouteContract(client, getUser, { pathParams: { userId: '1' } })
// user: { id: string; name: string }

// POST — body required by contract type
const created = await sendByRouteContract(client, createUser, { body: { name: 'Alice' } })

// DELETE — returns null on 204
const result = await sendByRouteContract(client, deleteUser, { pathParams: { userId: '1' } })
// result: null
```

#### Params

| Field | Description |
|---|---|
| `pathParams` | Path parameters — type inferred from `requestPathParamsSchema` |
| `body` | Request body — present only for POST/PUT/PATCH; type inferred from `requestBodySchema` |
| `queryParams` | Query parameters — type inferred from `requestQuerySchema` |
| `headers` | Request headers — type inferred from `requestHeaderSchema`; can be a plain object, `() => Headers`, or `() => Promise<Headers>` |
| `pathPrefix` | Optional prefix prepended to the resolved path (e.g. `'api/v2'`) |

### Deprecated API

| Deprecated | Replacement |
|---|---|
| `sendByContract` | `sendByRouteContract` |
| `sendByGetRoute` | `sendByRouteContract` |
| `sendByPayloadRoute` | `sendByRouteContract` |
| `sendByDeleteRoute` | `sendByRouteContract` |

### Server-sent events (SSE)

`connectSseByContract` opens an SSE stream defined by a contract and dispatches typed, schema-validated events to callbacks.

The connection starts immediately and runs in the background until the server closes the stream or you call `close()`. There is no automatic reconnection — if you need that, call `connectSseByContract` again from `onError` or after `onDone`.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { connectSseByContract } from '@lokalise/frontend-http-client'
import wretch from 'wretch'
import { z } from 'zod/v4'

const exportContract = buildSseContract({
    method: 'get',
    pathResolver: (params: { projectId: string }) => `/projects/${params.projectId}/export`,
    requestPathParamsSchema: z.object({ projectId: z.string() }),
    serverSentEventSchemas: {
        'item.exported': z.object({ id: z.string(), name: z.string() }),
        done: z.object({ total: z.number() }),
    },
})

const client = wretch('http://localhost:8000')

const connection = connectSseByContract(
    client,
    exportContract,
    { pathParams: { projectId: 'proj_123' } },
    {
        onEvent: {
            'item.exported': (data) => console.log('exported item:', data.id),
            done: (data) => console.log('finished, total:', data.total),
        },
        onOpen: () => console.log('stream opened'),
        onError: (err) => console.error('stream error:', err),
    },
)

// Stop the stream early if needed (e.g. user navigates away)
connection.close()
```

The following parameters can be specified:
- `pathParams` – path parameters used by the contract's path resolver
- `queryParams` – query parameters (type must match the contract definition)
- `body` – request body for POST/PUT/PATCH SSE endpoints
- `headers` – custom headers, or a (optionally async) function returning headers (useful for auth tokens)
- `pathPrefix` – optional prefix prepended to the resolved path

### Tracking request progress
Tracking requests progress is especially useful while uploading files. 

> **Important note**: `wretch` does not support request progress tracking, so we rely on XMLHttpRequest. That's why the interface of the method below is slightly different from the others 

Usage example:

```ts
 const response = await sendPostWithProgress({
    path: '/',
    data: new FormData(), 
    headers: { Authorization: 'Bearer ...' }, 
    responseBodySchema: z.object(),
    onProgress: (progress) => {
        console.log(`Loaded ${progress.loaded} of ${progress.total}`)
    }
})
```

### Aborting pending requests
Aborting requests is especially useful while uploading files. 

> **Important note**: Currently it is only possible with `sendWithProgress()` function 

Usage example:

```ts
const abortController = new AbortController()

sendPostWithProgress({
    path: '/',
    data: new FormData(), 
    headers: { Authorization: 'Bearer ...' },
    responseBodySchema: z.object(),
    onProgress: (progress) => {
        console.log(`Loaded ${progress.loaded} of ${progress.total}`)
    },
    abortController
})

abortController.abort()
```

## Credits

This library is brought to you by a joint effort of Lokalise engineers:

- [Ondrej Sevcik](https://github.com/ondrejsevcik)
- [Szymon Chudy](https://github.com/szymonchudy)
- [Nivedita Bhat](https://github.com/NiveditaBhat)
- [Arthur Suermondt](https://github.com/arthuracs)
- [Lauris Mikāls](https://github.com/laurismikals)
- [Oskar Kupski](https://github.com/oskarski)
- [Igor Savin](https://github.com/kibertoad)
