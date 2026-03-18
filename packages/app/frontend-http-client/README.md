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
