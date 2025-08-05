import type {
  AnyDeleteRoute,
  AnyGetRoute,
  AnyPayloadRoute,
  AnyRoute,
  AnyRoutes,
  Headers,
  InferDeleteDetails,
  InferGetDetails,
  InferPayloadDetails,
  InferSchemaInput,
  InferSchemaOutput,
} from '@lokalise/api-contracts'
import type { Wretch, WretchResponse } from 'wretch'
import type { ZodSchema, z } from 'zod/v4'

export type HeadersObject = Record<string, string>
export type HeadersSource = HeadersObject | (() => HeadersObject) | (() => Promise<HeadersObject>)
type FreeformRecord = Record<string, unknown>

export type CommonRequestParams<
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  path: string
  responseBodySchema: ZodSchema<ResponseBody>
  isEmptyResponseExpected?: IsEmptyResponseExpected // 204 is considered a success. Default is "false" for GET operations and "true" for everything else
  isNonJSONResponseExpected?: IsNonJSONResponseExpected // Do not throw an error if not receiving 'application/json' content-type.  Default is "false" for GET operations and "true" for everything else
}

export type BodyRequestParams<
  RequestBodySchema extends z.ZodSchema,
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  body: z.input<RequestBodySchema> | undefined
  requestBodySchema: RequestBodySchema | undefined
} & CommonRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>

export type FreeBodyRequestParams<
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  body?: FreeformRecord
  requestBodySchema?: never
} & CommonRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>

export type QueryParams<
  RequestQuerySchema extends z.ZodSchema,
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  queryParams: z.input<RequestQuerySchema> | undefined
  queryParamsSchema: RequestQuerySchema | undefined
} & CommonRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>

export type FreeQueryParams<
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  queryParams?: FreeformRecord
  queryParamsSchema?: never
} & CommonRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>

export type HeadersParams<HeadersSchema extends z.ZodSchema> = {
  headers: z.input<HeadersSchema>
  headersSchema: HeadersSchema
}

export type FreeHeadersParams<_HeadersSchema> = {
  headers?: Record<string, string>
  headersSchema?: never
}

export type DeleteParams<
  RequestQuerySchema extends z.ZodSchema,
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  queryParams: z.input<RequestQuerySchema> | undefined
  queryParamsSchema: RequestQuerySchema | undefined
} & Omit<
  CommonRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>,
  'responseBodySchema'
> & {
    responseBodySchema?: ZodSchema<ResponseBody>
  }

export type FreeDeleteParams<
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
> = {
  queryParams?: FreeformRecord
  queryParamsSchema?: never
} & Omit<
  CommonRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>,
  'responseBodySchema'
> & {
    responseBodySchema?: ZodSchema<ResponseBody>
  }

export type RequestResultType<
  ResponseBody,
  isNonJSONResponseExpected extends boolean,
  isEmptyResponseExpected extends boolean,
> = isEmptyResponseExpected extends true
  ? isNonJSONResponseExpected extends true
    ? WretchResponse | null
    : ResponseBody extends undefined
      ? null
      : ResponseBody | null
  : isNonJSONResponseExpected extends true
    ? WretchResponse
    : ResponseBody extends undefined
      ? null
      : ResponseBody

export type PayloadRequestParamsWrapper<
  RequestBody,
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  HeadersSchema extends z.Schema | undefined = undefined,
> = (RequestBody extends z.Schema
  ? BodyRequestParams<RequestBody, ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>
  : FreeBodyRequestParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>) &
  (RequestQuerySchema extends z.Schema
    ? QueryParams<
        RequestQuerySchema,
        ResponseBody,
        IsNonJSONResponseExpected,
        IsEmptyResponseExpected
      >
    : FreeQueryParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>) &
  (HeadersSchema extends z.Schema ? HeadersParams<HeadersSchema> : FreeHeadersParams<HeadersSchema>)

export type GetParamsWrapper<
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  HeadersSchema extends z.Schema | undefined = undefined,
> = (RequestQuerySchema extends z.Schema
  ? QueryParams<
      RequestQuerySchema,
      ResponseBody,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >
  : FreeQueryParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>) &
  (HeadersSchema extends z.Schema ? HeadersParams<HeadersSchema> : FreeHeadersParams<HeadersSchema>)

export type DeleteParamsWrapper<
  ResponseBody,
  IsNonJSONResponseExpected extends boolean,
  IsEmptyResponseExpected extends boolean,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  HeadersSchema extends z.Schema | undefined = undefined,
> = (RequestQuerySchema extends z.Schema
  ? DeleteParams<
      RequestQuerySchema,
      ResponseBody,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >
  : FreeDeleteParams<ResponseBody, IsNonJSONResponseExpected, IsEmptyResponseExpected>) &
  (HeadersSchema extends z.Schema ? HeadersParams<HeadersSchema> : FreeHeadersParams<HeadersSchema>)

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
} extends infer Mandatory
  ? {
      [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K]
    }
  : never

// biome-ignore lint/suspicious/noExplicitAny: We don't know which addons Wretch will have, and we don't really care, hence any
export type WretchInstance = Wretch<any, unknown, undefined>

export type GetRouteParameters<
  Route extends AnyGetRoute,
  ExcludeHeaders extends Headers,
  Inferred extends InferGetDetails<Route> = InferGetDetails<Route>,
> = RouteRequestParams<
  InferSchemaInput<Inferred['pathParamsSchema']>,
  InferSchemaInput<Inferred['requestQuerySchema']>,
  keyof InferSchemaInput<Inferred['requestHeaderSchema']> extends never
    ? never
    : keyof ExcludeHeaders extends never
      ? InferSchemaInput<Inferred['requestHeaderSchema']>
      : Omit<InferSchemaInput<Inferred['requestHeaderSchema']>, keyof ExcludeHeaders>
>

export type GetRouteReturnType<
  Route extends AnyGetRoute,
  Inferred extends InferGetDetails<Route> = InferGetDetails<Route>,
> = Promise<
  RequestResultType<
    InferSchemaOutput<Inferred['responseBodySchema']>,
    Inferred['isNonJSONResponseExpected'],
    Inferred['isEmptyResponseExpected']
  >
>

export type DeleteRouteParameters<
  Route extends AnyDeleteRoute,
  ExcludeHeaders extends Headers,
  Inferred extends InferDeleteDetails<Route> = InferDeleteDetails<Route>,
> = RouteRequestParams<
  InferSchemaInput<Inferred['pathParamsSchema']>,
  InferSchemaInput<Inferred['requestQuerySchema']>,
  keyof InferSchemaInput<Inferred['requestHeaderSchema']> extends never
    ? never
    : keyof ExcludeHeaders extends never
      ? InferSchemaInput<Inferred['requestHeaderSchema']>
      : Omit<InferSchemaInput<Inferred['requestHeaderSchema']>, keyof ExcludeHeaders>
>

export type DeleteRouteReturnType<
  Route extends AnyDeleteRoute,
  Inferred extends InferDeleteDetails<Route> = InferDeleteDetails<Route>,
> = Promise<
  RequestResultType<
    InferSchemaOutput<Inferred['responseBodySchema']>,
    Inferred['isNonJSONResponseExpected'],
    Inferred['isEmptyResponseExpected']
  >
>

export type PayloadRouteParameters<
  Route extends AnyPayloadRoute,
  ExcludeHeaders extends Headers,
  Inferred extends InferPayloadDetails<Route> = InferPayloadDetails<Route>,
> = PayloadRouteRequestParams<
  InferSchemaInput<Inferred['pathParamsSchema']>,
  InferSchemaInput<Inferred['requestBodySchema']>,
  InferSchemaInput<Inferred['requestQuerySchema']>,
  keyof InferSchemaInput<Inferred['requestHeaderSchema']> extends never
    ? never
    : keyof ExcludeHeaders extends never
      ? InferSchemaInput<Inferred['requestHeaderSchema']>
      : Omit<InferSchemaInput<Inferred['requestHeaderSchema']>, keyof ExcludeHeaders>
>

export type PayloadRouteReturnType<
  Route extends AnyPayloadRoute,
  Inferred extends InferPayloadDetails<Route> = InferPayloadDetails<Route>,
> = Promise<
  RequestResultType<
    InferSchemaOutput<Inferred['responseBodySchema']>,
    Inferred['isNonJSONResponseExpected'],
    Inferred['isEmptyResponseExpected']
  >
>

export type ContractService<Routes extends AnyRoutes, ExtraHeaders extends Headers> = {
  [K in keyof Routes]: Routes[K] extends {
    route: infer T
  }
    ? T extends AnyGetRoute
      ? (params: GetRouteParameters<T, ExtraHeaders>) => GetRouteReturnType<T>
      : T extends AnyDeleteRoute
        ? (params: DeleteRouteParameters<T, ExtraHeaders>) => DeleteRouteReturnType<T>
        : T extends AnyPayloadRoute
          ? (params: PayloadRouteParameters<T, ExtraHeaders>) => PayloadRouteReturnType<T>
          : never
    : never
}

export type AnyRouteParameters<
  T extends AnyRoute,
  ExcludeHeaders extends Headers,
> = T extends AnyGetRoute
  ? GetRouteParameters<T, ExcludeHeaders>
  : T extends AnyDeleteRoute
    ? DeleteRouteParameters<T, ExcludeHeaders>
    : T extends AnyPayloadRoute
      ? PayloadRouteParameters<T, ExcludeHeaders>
      : never
