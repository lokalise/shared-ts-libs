# Frontend HTTP client

Opinionated HTTP client for the frontend.

Note that it is a ESM-only package.

## Basic usage

```ts
import wretch from 'wretch'
import { z } from 'zod'

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

### API contract-based requests

`frontend-http-client` supports using API contracts, created with `@lokalise/universal-ts-utils/api-contracts/apiContracts` in order to make fully type-safe HTTP requests.

Usage example:

```ts
import { somePostRouteDefinition, someGetRouteDefinition } from 'some-service-api-contracts'
import { sendByPayloadRoute } from '@lokalise/frontend-http-client'
import wretch from 'wretch'

const client = wretch(BASE_URL)

const responseBody1 = await sendByPayloadRoute(client, somePostRouteDefinition, {
    pathParams: {
        userId: 1,
    },
    body: {
        isActive: true,
    },
})

const responseBody2 = await sendByGetRoute(client, someGetRouteDefinition, {
    pathParams: {
        userId: 1,
    },
    queryParams: {
        id: 'testId',
    },
})
```

## Credits

This library is brought to you by a joint effort of Lokalise engineers:

- [Ondrej Sevcik](https://github.com/ondrejsevcik)
- [Szymon Chudy](https://github.com/szymonchudy)
- [Nivedita Bhat](https://github.com/NiveditaBhat)
- [Arthur Suermondt](https://github.com/arthuracs)
- [Lauris Mikāls](https://github.com/laurismikals)
- [Igor Savin](https://github.com/kibertoad)
