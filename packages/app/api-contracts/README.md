# api-contracts

Key idea behind API contracts: backend owns entire definition for the route, including its path, HTTP method used and
response structure expectations, and exposes it as a part of its API schemas. Then frontend consumes that definition
instead of forming full request configuration manually on the client side.

This reduces amount of assumptions FE needs to make about the behaviour of BE, reduces amount of code that needs to be
written on FE, and makes the code more type-safe (as path parameter setting is handled by logic exposed by BE, in a
type-safe way).

Usage examples:

```ts
import { buildGetRoute, buildDeleteRoute, buildPayloadRoute } from '@lokalise/api-contracts'

const getContract = buildGetRoute({
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    requestQuerySchema: REQUEST_QUERY_SCHEMA,
    requestHeaderSchema: REQUEST_HEADER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    summary: 'Route summary',
    metadata: { allowedRoles: ['admin'] },
})

const postContract = buildPayloadRoute({
    method: 'post', // can also be 'patch' or 'post'
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestBodySchema: REQUEST_BODY_SCHEMA,
    pathResolver: () => '/',
    summary: 'Route summary',
    metadata: { allowedPermission: ['edit'] },
})

const deleteContract = buildDeleteRoute({
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})
```

In the previous example, the `metadata` property is an optional, free-form field that allows you to store any additional
information related to the route. If you require more precise type definitions for the `metadata` field, you can utilize
TypeScript's module augmentation mechanism to enforce stricter typing. This allows for more controlled and type-safe
usage in your route definitions.

Here is how you can apply strict typing to the `metadata` property using TypeScript module augmentation:
```typescript 
// file -> apiContracts.d.ts
// Import the existing module to ensure TypeScript recognizes the original definitions
import '@lokalise/api-contracts';

// Augment the module to extend the interface with specific properties
declare module '@lokalise/api-contracts' {
    interface CommonRouteDefinitionMetadata {
        myTestProp?: string[];
        mySecondTestProp?: number;
    }
}
```

Note that in order to make contract-based requests, you need to use a compatible HTTP client
(`@lokalise/frontend-http-client` or `@lokalise/backend-http-client`)

In case you are using fastify on the backend, you can also use `@lokalise/fastify-api-contracts` in order to simplify definition of your fastify routes, utilizing contracts as the single source of truth.

## Utility Functions

### `mapRouteToPath`

Converts a route definition to its corresponding path pattern with parameter placeholders.

```ts
import { mapRouteToPath, buildGetRoute } from '@lokalise/api-contracts'

const userContract = buildGetRoute({
    requestPathParamsSchema: z.object({ userId: z.string() }),
    successResponseBodySchema: USER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const pathPattern = mapRouteToPath(userContract)
// Returns: "/users/:userId"
```

This function is useful when you need to:
- Generate OpenAPI/Swagger documentation
- Create route patterns for server-side routing frameworks
- Display route information in debugging or logging

The function replaces actual path parameters with placeholder syntax (`:paramName`), making it compatible with Express-style route patterns.

### `describeContract`

Generates a human-readable description of a route contract, combining the HTTP method with the route path.

```ts
import { describeContract, buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'

const getContract = buildGetRoute({
    requestPathParamsSchema: z.object({ userId: z.string() }),
    successResponseBodySchema: USER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const postContract = buildPayloadRoute({
    method: 'post',
    requestPathParamsSchema: z.object({ 
        orgId: z.string(),
        userId: z.string() 
    }),
    requestBodySchema: CREATE_USER_SCHEMA,
    successResponseBodySchema: USER_SCHEMA,
    pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
})

console.log(describeContract(getContract))  // "GET /users/:userId"
console.log(describeContract(postContract)) // "POST /orgs/:orgId/users/:userId"
```

This function is particularly useful for:
- Logging and debugging API calls
- Generating documentation or route summaries
- Error messages that need to reference specific endpoints
- Test descriptions and assertions
