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
