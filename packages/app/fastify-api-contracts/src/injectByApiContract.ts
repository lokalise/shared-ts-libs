import type { ApiContract, ClientRequestParams } from '@lokalise/api-contracts'
import type { Response as LightMyRequestResponse } from 'light-my-request'

import { type AnyFastifyInstance, dispatchInjectByMethod } from './injectRequestDispatcher.ts'

/**
 * Request params for {@link injectByApiContract}, derived directly from a `defineApiContract`
 * contract.
 *
 * This mirrors the contract client's `ClientRequestParams`, minus the `streaming` field, which is
 * not relevant when injecting requests against a Fastify instance:
 * - `pathParams`, `body`, `queryParams` and `headers` are each required only when the matching
 *   request schema is defined on the contract, and omitted otherwise.
 * - `headers` accepts either a plain object or a (sync or async) function producing it.
 * - `pathPrefix` is always optional and, when provided, is prepended to the resolved path.
 */
export type InjectByApiContractParams<TApiContract extends ApiContract> = Omit<
  ClientRequestParams<TApiContract, false>,
  'streaming'
>

/**
 * Unified request injector for contracts created with `defineApiContract` (the newer API of
 * `@lokalise/api-contracts`). It dispatches a request through Fastify's
 * [`inject`](https://fastify.dev/docs/latest/Guides/Testing/) and automatically determines the HTTP
 * method from the contract.
 *
 * This is the `defineApiContract` counterpart of {@link injectByContract}, which targets the
 * deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` route definitions. The params
 * type is resolved directly from the contract:
 * - GET/DELETE contracts → params without a request body
 * - POST/PUT/PATCH contracts → params with a request body (omitted when `ContractNoBody`)
 *
 * An optional `pathPrefix` is prepended to the path resolved from the contract, matching the
 * behavior of the contract client.
 */
export function injectByApiContract<const TApiContract extends ApiContract>(
  app: AnyFastifyInstance,
  apiContract: TApiContract,
  params: InjectByApiContractParams<TApiContract>,
): Promise<LightMyRequestResponse>

// Implementation
export function injectByApiContract(
  app: AnyFastifyInstance,
  apiContract: ApiContract,
  // biome-ignore lint/suspicious/noExplicitAny: params shape depends on the contract
  params: any,
): Promise<LightMyRequestResponse> {
  const path = `${params.pathPrefix ?? ''}${apiContract.pathResolver(params.pathParams)}`

  return dispatchInjectByMethod(app, apiContract.method, path, params)
}
