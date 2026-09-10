import {
  type ApiContract,
  buildRequestPath,
  type ClientRequestParams,
} from '@lokalise/api-contracts'
import type { FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'

// biome-ignore lint/suspicious/noExplicitAny: we don't care about what kind of app instance we get here
export type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>

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
 * Unified request injector for contracts created with `defineApiContract`. It dispatches a request through Fastify's
 * [`inject`](https://fastify.dev/docs/latest/Guides/Testing/) and automatically determines the HTTP
 * method from the contract.
 *
 * The params type is resolved directly from the contract:
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
export async function injectByApiContract(
  app: AnyFastifyInstance,
  apiContract: ApiContract,
  // biome-ignore lint/suspicious/noExplicitAny: params shape depends on the contract
  params: any,
): Promise<LightMyRequestResponse> {
  const path = buildRequestPath(apiContract.pathResolver(params.pathParams), params.pathPrefix)
  const headers = typeof params.headers === 'function' ? await params.headers() : params.headers

  switch (apiContract.method) {
    case 'get':
      return app.inject().get(path).headers(headers).query(params.queryParams).end()
    case 'delete':
      return app.inject().delete(path).headers(headers).query(params.queryParams).end()
    case 'post':
      return app
        .inject()
        .post(path)
        .body(params.body)
        .headers(headers)
        .query(params.queryParams)
        .end()
    case 'put':
      return app
        .inject()
        .put(path)
        .body(params.body)
        .headers(headers)
        .query(params.queryParams)
        .end()
    case 'patch':
      return app
        .inject()
        .patch(path)
        .body(params.body)
        .headers(headers)
        .query(params.queryParams)
        .end()
  }
}

/** Short-named entry point for {@link injectByApiContract}. */
export const injectByContract = injectByApiContract

/** Short-named alias of {@link InjectByApiContractParams}. */
export type InjectByContractParams<TApiContract extends ApiContract> =
  InjectByApiContractParams<TApiContract>
