# backend-http-client 🧬

Opinionated HTTP client for the Node.js backend

## Overview

The library provides methods to implement the client side of HTTP protocols. Public methods available are:

- `buildClient()`, which returns a [Client](https://undici.nodejs.org/#/docs/api/Client) instance and should be called before any of the following methods with parameters:
  - `baseUrl`;
  - `clientOptions` – set of [ClientOptions](https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions) (optional). If none are provided, the following default options will be used to instantiate the client:
    ```
    keepAliveMaxTimeout: 300_000,
    keepAliveTimeout: 4000,
    ```
- `sendGet()`;
- `sendPost()`;
- `sendPut()`;
- `sendPutBinary()`;
- `sendDelete()`;
- `sendPatch()`.

All _send_ methods accept a type parameter and the following arguments:

- `client`, the return value of `buildClient()`;
- `path`;
- `options` – (optional). Possible values are:

  - `headers`;
  - `query`, query string params to be embedded in the request URL;
  - `timeout`, the timeout after which a request will time out, in milliseconds. Default is 30 seconds. Pass `undefined` if you prefer to have no timeout;
  - `throwOnError`;`
  - `reqContext`;
  - `safeParseJson`, used when the response content-type is `application/json`. If `true`, the response body will be parsed as JSON and a `ResponseError` will be thrown in case of syntax errors. If `false`, errors are not handled;
  - `blobResponseBody`, used when the response body should be returned as Blob;
  - `requestLabel`, this string will be returned together with any thrown or returned Error to provide additional context about what request was being executed when the error has happened;
  - `disableKeepAlive`;`
  - `retryConfig`, defined by:
    - `maxAttempts`, the maximum number of times a request should be retried;
    - `delayBetweenAttemptsInMsecs`;
    - `statusCodesToRetry`, the status codes that trigger a retry;
    - `retryOnTimeout`;
  - `clientOptions`;
  - `responseSchema`, used both for inferring the response type of the call, and also (if `validateResponse` is `true`) for validating the response structure;
  - `validateResponse`;
  - `isEmptyResponseExpected`, used to specify if a 204 response should be treated as an error or not. when `true` the response body type is adjusted to include potential `null`

  The following options are applied by default:

  ```
  validateResponse: true,
  throwOnError: true,
  timeout: 30000,
  retryConfig: {
      maxAttemps: 1,
      delayBetweenAttemptsInMsecs: 0,
      statusCodesToRetry: [],
      retryOnTimeout: false,
  }
  ```
  For `sendDelete()` `isEmptyResponseExpected` by default is set to `true`, for all other methods it is `false`.

Additionally, `sendPost()`, `sendPut()`, `sendPutBinary()`, and `sendPatch()` also accept a `body` parameter.

The response of any _send_ method will be resolved to always have `result` set, but only have `error` set in case something went wrong. See [Either](#either) for more information.

## Either

The library provides the type `Either` for error handling in the functional paradigm. The two possible values are:

- `result` is defined, `error` is undefined;
- `error` is defined, `result` is undefined.

It's up to the caller of the function to handle the received error or throw an error.

Read [this article](https://antman-does-software.com/stop-catching-errors-in-typescript-use-the-either-type-to-make-your-code-predictable) for more information on how `Either` works and its benefits.

Additionally, `DefiniteEither` is also provided. It is a variation of the aforementioned `Either`, which may or may not have `error` set, but always has `result`.

### API contract-based requests

`backend-http-client` supports using API contracts, created with `@lokalise/api-contracts` in order to make fully type-safe HTTP requests.

Usage example:

```ts
import { somePostRouteDefinition, someGetRouteDefinition } from 'some-service-api-contracts'
import { sendByPayloadRoute, buildClient } from '@lokalise/backend-http-client'

const MY_BASE_URL = 'http://localhost:8080'
const client = buildClient(MY_BASE_URL)

const responseBodyPost = await sendByPayloadRoute(client, somePostRouteDefinition, 
// pass contract-defined request params, such as body, query and headers here
    {
        pathParams: {
            userId: 1,
        },
        body: {
            isActive: true,
        },
    }, 
// pass backend-http-client options here        
    {
        validateResponse: false,
        requestLabel: 'Create user',
    }
)

const responseBodyGet = await sendByGetRoute(client, someGetRouteDefinition,
// pass contract-defined request params, such as query and headers here
        {
          pathParams: {
            userId: 1,
          },
          queryParams: {
            withMetadata: true,
          },
        },
// pass backend-http-client options here        
        {
          validateResponse: false,
          requestLabel: 'Retrieve user',
        }
)
```

The following parameters can be specified when sending API contract-based requests:
- `body` - request body (only applicable for `sendByPayloadRoute`, type needs to match with contract definition)
- `queryParams` - query parameters (type needs to match with contract definition)
- `headers` - custom headers to be sent with the request (type needs to match with contract definition)
- `pathParams` – parameters used for path resolver (type needs to match with contract definition)
- `pathPrefix` - optional prefix to be prepended to the path resolved by the contract's path resolver
