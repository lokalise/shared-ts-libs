# @lokalise/fastify-api-contracts

## 5.4.1

### Patch Changes

- dae7dc7: Make the contract `summary` field mandatory on `defineApiContract`, and surface it in the http-client `UnexpectedResponseError` for debugging.

  - `summary` is now required on every contract (previously optional).
  - `UnexpectedResponseError` (fe + be) gains a required `summary` constructor argument and a `readonly summary` field, and includes it in the error message (`Unexpected response for "<summary>": …`). `sendByApiContract` passes `contract.summary` through automatically.

## 5.4.0

### Minor Changes

- 2c810de: Add `injectByApiContract`, a test-request injector for contracts created with `defineApiContract` (the current `@lokalise/api-contracts` API). It mirrors `injectByContract` but resolves its params (`pathParams`/`body`/`queryParams`/`headers`/`pathPrefix`) directly from the `defineApiContract` contract, including `ContractNoBody` handling and an optional `pathPrefix` that is prepended to the resolved path. The resolved params type is exported as `InjectByApiContractParams`.
