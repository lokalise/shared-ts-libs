# @lokalise/fastify-api-contracts

## 5.4.0

### Minor Changes

- 2c810de: Add `injectByApiContract`, a test-request injector for contracts created with `defineApiContract` (the current `@lokalise/api-contracts` API). It mirrors `injectByContract` but resolves its params (`pathParams`/`body`/`queryParams`/`headers`/`pathPrefix`) directly from the `defineApiContract` contract, including `ContractNoBody` handling and an optional `pathPrefix` that is prepended to the resolved path. The resolved params type is exported as `InjectByApiContractParams`.
