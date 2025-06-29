import type { FreeformRecord } from '@lokalise/node-core'
import type { RequestResult } from 'undici-retry'
import type { ZodSchema, z } from 'zod/v4'

export type HeadersObject = Record<string, string>
export type HeadersSource = HeadersObject | (() => HeadersObject) | (() => Promise<HeadersObject>)

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
  headers: z.input<HeadersSchema> | undefined
  headersSchema: HeadersSchema | undefined
}

export type FreeHeadersParams<_HeadersSchema> = {
  headers?: FreeformRecord
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
    ? RequestResult<ResponseBody> | null
    : ResponseBody extends undefined
      ? null
      : ResponseBody | null
  : isNonJSONResponseExpected extends true
    ? RequestResult<ResponseBody>
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
