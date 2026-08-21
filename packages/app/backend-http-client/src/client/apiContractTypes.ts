import type { ApiContract, CommonRouteDefinition } from '@lokalise/api-contracts'

/**
 * Contract fields that only the serving side acts upon; the HTTP client never reads them.
 * Add future mandatory server-side fields here.
 */
export type ServerOnlyContractFields = Pick<ApiContract, 'visibility'>

/**
 * Loosens a route definition's server-only fields to optional, so contracts compiled against
 * older `@lokalise/api-contracts` — whose types lack them (e.g. `visibility` before 7.2) — are
 * still accepted. The HTTP client never reads those fields; they only matter on server side.
 */
export type ClientCompatibleContract<
  // biome-ignore lint/suspicious/noExplicitAny: accepts any route definition shape
  T extends ApiContract | CommonRouteDefinition<any, any, any, any, any, any, any, any>,
> = Omit<T, keyof ServerOnlyContractFields> & Partial<ServerOnlyContractFields>

export type PayloadRouteRequestParams<
  PathParams = undefined,
  RequestBody = undefined,
  RequestQuery = never,
  RequestHeader = never,
> = {
  body: RequestBody extends undefined ? never : RequestBody
  queryParams: RequestQuery extends never | undefined ? never : RequestQuery
  headers: RequestHeader extends never | undefined
    ? never
    : RequestHeader | (() => RequestHeader) | (() => Promise<RequestHeader>)
  pathParams: PathParams extends undefined ? never : PathParams
  pathPrefix?: string
} extends infer Mandatory
  ? {
      [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K]
    }
  : never

export type RouteRequestParams<
  PathParams = undefined,
  RequestQuery = never,
  RequestHeader = never,
> = {
  queryParams: RequestQuery extends never | undefined ? never : RequestQuery
  headers: RequestHeader extends never | undefined
    ? never
    : RequestHeader | (() => RequestHeader) | (() => Promise<RequestHeader>)
  pathParams: PathParams extends undefined ? never : PathParams
  pathPrefix?: string
} extends infer Mandatory
  ? {
      [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K]
    }
  : never
