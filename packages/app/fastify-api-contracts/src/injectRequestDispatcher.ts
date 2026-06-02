import type { FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'

// biome-ignore lint/suspicious/noExplicitAny: we don't care about what kind of app instance we get here
export type AnyFastifyInstance = FastifyInstance<any, any, any, any>

type DispatchParams = {
  // biome-ignore lint/suspicious/noExplicitAny: headers shape depends on the contract
  headers?: any
  // biome-ignore lint/suspicious/noExplicitAny: body shape depends on the contract
  body?: any
  // biome-ignore lint/suspicious/noExplicitAny: query shape depends on the contract
  queryParams?: any
}

/**
 * Shared runtime dispatch for the contract-based request injectors.
 *
 * The HTTP method and resolved path are derived from the contract by the caller; this helper only
 * turns them into a `light-my-request` injection. `headers` may be a plain object or a (sync or
 * async) factory, which is resolved here before dispatching.
 */
export async function dispatchInjectByMethod(
  app: AnyFastifyInstance,
  method: string,
  path: string,
  params: DispatchParams,
): Promise<LightMyRequestResponse> {
  const resolvedHeaders =
    typeof params.headers === 'function' ? await params.headers() : params.headers

  switch (method) {
    case 'get':
      return app.inject().get(path).headers(resolvedHeaders).query(params.queryParams).end()
    case 'delete':
      return app.inject().delete(path).headers(resolvedHeaders).query(params.queryParams).end()
    case 'post':
      return app
        .inject()
        .post(path)
        .body(params.body)
        .headers(resolvedHeaders)
        .query(params.queryParams)
        .end()
    case 'put':
      return app
        .inject()
        .put(path)
        .body(params.body)
        .headers(resolvedHeaders)
        .query(params.queryParams)
        .end()
    case 'patch':
      return app
        .inject()
        .patch(path)
        .body(params.body)
        .headers(resolvedHeaders)
        .query(params.queryParams)
        .end()
    default:
      throw new Error(`Unsupported HTTP method: ${method}`)
  }
}
