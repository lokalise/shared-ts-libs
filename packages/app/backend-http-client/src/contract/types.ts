import type {
  AnyDeleteRoute,
  AnyGetRoute,
  AnyPayloadRoute,
  AnyRoute,
  AnyRoutes,
  ConfiguredContractService,
  ContractDefinitions,
  Headers,
  HeadersFromBuilder,
  InferDeleteDetails,
  InferGetDetails,
  InferPayloadDetails,
  InferSchemaInput,
  InferSchemaOutput,
} from '@lokalise/api-contracts'
import type { Client } from 'undici'
import type { PayloadRouteRequestParams, RouteRequestParams } from '../client/apiContractTypes.js'
import type { DEFAULT_OPTIONS } from '../client/constants.js'
import type { RequestOptions, RequestResultDefinitiveEither } from '../client/types.js'

type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError
type ResolveRequiredHeaders<H extends Headers, E extends Headers> = Omit<H, keyof E>

export type GetRouteParameters<
  Route extends AnyGetRoute,
  ExcludeHeaders extends Headers,
  Inferred extends InferGetDetails<Route> = InferGetDetails<Route>,
  RequestHeader extends Headers = InferSchemaInput<Inferred['requestHeaderSchema']>,
  RequiredHeaders extends Headers = ResolveRequiredHeaders<RequestHeader, ExcludeHeaders>,
> = RouteRequestParams<
  InferSchemaInput<Inferred['pathParamsSchema']>,
  InferSchemaInput<Inferred['requestQuerySchema']>,
  keyof RequestHeader extends never ? never : RequiredHeaders
>

export type GetRouteOptions<
  Route extends AnyGetRoute,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  Inferred extends InferGetDetails<Route> = InferGetDetails<Route>,
> = Omit<
  RequestOptions<
    Inferred['responseBodySchema'],
    Inferred['isEmptyResponseExpected'],
    DoThrowOnError
  >,
  'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
>

export type GetRouteReturnType<
  Route extends AnyGetRoute,
  Inferred extends InferGetDetails<Route> = InferGetDetails<Route>,
> = Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<Inferred['responseBodySchema']>,
    Inferred['isNonJSONResponseExpected'],
    Inferred['isEmptyResponseExpected']
  >
>

export type DeleteRouteParameters<
  Route extends AnyDeleteRoute,
  ExcludeHeaders extends Headers,
  Inferred extends InferDeleteDetails<Route> = InferDeleteDetails<Route>,
  RequestHeader extends Headers = InferSchemaInput<Inferred['requestHeaderSchema']>,
  RequiredHeaders extends Headers = ResolveRequiredHeaders<RequestHeader, ExcludeHeaders>,
> = RouteRequestParams<
  InferSchemaInput<Inferred['pathParamsSchema']>,
  InferSchemaInput<Inferred['requestQuerySchema']>,
  keyof RequestHeader extends never ? never : RequiredHeaders
>

export type DeleteRouteReturnOptions<
  Route extends AnyDeleteRoute,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  Inferred extends InferDeleteDetails<Route> = InferDeleteDetails<Route>,
> = Omit<
  RequestOptions<
    Inferred['responseBodySchema'],
    Inferred['isEmptyResponseExpected'],
    DoThrowOnError
  >,
  'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
>

export type DeleteRouteReturnType<
  Route extends AnyDeleteRoute,
  Inferred extends InferDeleteDetails<Route> = InferDeleteDetails<Route>,
> = Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<Inferred['responseBodySchema']>,
    Inferred['isNonJSONResponseExpected'],
    Inferred['isEmptyResponseExpected']
  >
>

export type PayloadRouteParameters<
  Route extends AnyPayloadRoute,
  ExcludeHeaders extends Headers,
  Inferred extends InferPayloadDetails<Route> = InferPayloadDetails<Route>,
  RequestHeader extends Headers = InferSchemaInput<Inferred['requestHeaderSchema']>,
  RequiredHeaders extends Headers = ResolveRequiredHeaders<RequestHeader, ExcludeHeaders>,
> = PayloadRouteRequestParams<
  InferSchemaInput<Inferred['pathParamsSchema']>,
  InferSchemaInput<Inferred['requestBodySchema']>,
  InferSchemaInput<Inferred['requestQuerySchema']>,
  keyof RequestHeader extends never ? never : RequiredHeaders
>

export type PayloadRouteReturnOptions<
  Route extends AnyPayloadRoute,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
  Inferred extends InferPayloadDetails<Route> = InferPayloadDetails<Route>,
> = Omit<
  RequestOptions<
    Inferred['responseBodySchema'],
    Inferred['isEmptyResponseExpected'],
    DoThrowOnError
  >,
  'body' | 'headers' | 'query' | 'isEmptyResponseExpected' | 'responseSchema'
>

export type PayloadRouteReturnType<
  Route extends AnyPayloadRoute,
  Inferred extends InferPayloadDetails<Route> = InferPayloadDetails<Route>,
> = Promise<
  RequestResultDefinitiveEither<
    InferSchemaOutput<Inferred['responseBodySchema']>,
    Inferred['isNonJSONResponseExpected'],
    Inferred['isEmptyResponseExpected']
  >
>

export type ContractService<
  Routes extends AnyRoutes,
  ContractHeaders extends Headers,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
> = {
  [K in keyof Routes]: Routes[K] extends { route: infer T }
    ? T extends AnyGetRoute
      ? (
          params: GetRouteParameters<T, ContractHeaders>,
          options: GetRouteOptions<T, DoThrowOnError>,
        ) => GetRouteReturnType<T>
      : T extends AnyDeleteRoute
        ? (
            params: DeleteRouteParameters<T, ContractHeaders>,
            options: DeleteRouteReturnOptions<T, DoThrowOnError>,
          ) => DeleteRouteReturnType<T>
        : T extends AnyPayloadRoute
          ? (
              params: PayloadRouteParameters<T, ContractHeaders>,
              options: PayloadRouteReturnOptions<T, DoThrowOnError>,
            ) => PayloadRouteReturnType<T>
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

export type AnyRouteOptions<
  T extends AnyRoute,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
> = T extends AnyGetRoute
  ? GetRouteOptions<T, DoThrowOnError>
  : T extends AnyDeleteRoute
    ? DeleteRouteReturnOptions<T, DoThrowOnError>
    : T extends AnyPayloadRoute
      ? PayloadRouteReturnOptions<T, DoThrowOnError>
      : never
