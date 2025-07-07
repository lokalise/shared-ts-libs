import {
    type AnyGetRoute,
    type AnyRoute,
    buildGetRoute,
    buildPayloadRoute,
    defineContract,
    type GetRouteDefinition,
    type InferSchemaInput,
    type InferSchemaOutput,
    type RouteDetails,
    type ServiceMethodsFromDefinition,
} from '@lokalise/api-contracts'
import { z } from 'zod/v4'
import type { RequestResultType, RouteRequestParams } from './types.js'
import { sendByGetRoute } from './client.js'
import wretch, { type Wretch } from 'wretch'

const BODY_SCHEMA = z.object({})

const PATH_PARAMS_SCHEMA = z.object({
    userId: z.string(),
})
const PATH_PARAMS_MULTI_SCHEMA = z.object({
    userId: z.string(),
    orgId: z.string(),
})
const contract = buildPayloadRoute({
    successResponseBodySchema: BODY_SCHEMA,
    requestBodySchema: BODY_SCHEMA,
    method: 'post',
    description: 'some description',
    responseSchemasByStatusCode: {
        200: BODY_SCHEMA,
        400: z.object({ message: z.string() }),
    },
    pathResolver: () => '/',
})

const otherContract = buildGetRoute({
    successResponseBodySchema: BODY_SCHEMA,
    requestPathParamsSchema: PATH_PARAMS_SCHEMA,
    requestHeaderSchema: PATH_PARAMS_MULTI_SCHEMA,
    pathResolver: () => '/other',
})

const a = defineContract('Testing', {
    routes: {
        testing: { route: contract },
        otherTesting: { route: otherContract },
    },
})

type Asd = ServiceMethodsFromDefinition<typeof a>

type GetDetailsFromRoute<Route extends AnyGetRoute> =
    Route extends GetRouteDefinition<
            infer SuccessResponseBodySchema,
            infer PathParamsSchema,
            infer RequestQuerySchema,
            infer RequestHeaderSchema,
            infer IsNonJSONResponseExpected,
            infer IsEmptyResponseExpected
        >
        ? {
            successResponseBodySchema: SuccessResponseBodySchema
            pathParamsSchema: PathParamsSchema
            requestQuerySchema: RequestQuerySchema
            requestHeaderSchema: RequestHeaderSchema
            isNonJSONResponseExpected: IsNonJSONResponseExpected
            isEmptyResponseExpected: IsEmptyResponseExpected
        }
        : never

type GetMethodParams<Inferred extends GetDetailsFromRoute<AnyGetRoute>> = RouteRequestParams<
    InferSchemaInput<Inferred['pathParamsSchema']>,
    InferSchemaInput<Inferred['requestQuerySchema']>,
    InferSchemaInput<Inferred['requestHeaderSchema']>
>

type GetMethodType<Route extends AnyGetRoute, Inferred extends GetDetailsFromRoute<Route> = GetDetailsFromRoute<Route>> = (
    params: GetMethodParams<Inferred>,
) => Promise<
    RequestResultType<
        InferSchemaOutput<Inferred['successResponseBodySchema']>,
        Inferred['isNonJSONResponseExpected'],
        Inferred['isEmptyResponseExpected']
    >
>

function doo<const Details extends RouteDetails<AnyGetRoute>>(details: Details): GetMethodType<Details['route']>
// function doo<const Details extends RouteDetails<AnyDeleteRoute>>(details: Details)
// function doo<const Details extends RouteDetails<AnyPayloadRoute>>(details: Details)
function doo<const Details extends RouteDetails<AnyRoute>>(details: Details) {
    const client = wretch('')


    switch (details.route.method) {
        case 'get':
            return doooGet(client, details as RouteDetails<AnyGetRoute>)

        case 'delete':
            return 'DELETE_THING' as const

        case 'post':
        case 'put':
        case 'patch':
            return 'PAYLOAD_THING' as const
    }
}

function doooGet<
    const Route extends AnyGetRoute,
    Inferred extends GetDetailsFromRoute<Route> = GetDetailsFromRoute<Route>
>(
    client: Wretch,
    route: Route,
): GetMethodType<Route, Inferred> {
    return ((params) => {
        if ('headers' in params) {
            return sendByGetRoute(client, route, params)
        }
        return sendByGetRoute(client, route, params as GetMethodParams<Inferred>)
    }) as GetMethodType<Route, Inferred>
}

const b = doooGet(wretch(''), a.config.routes.otherTesting.route)
b({ pathParams: { userId: '123' } })

// import {
//   type AnyGetRoute,
//   type AnyRoute,
//   type AnyRouter,
//   type AvailableService,
//   buildGetRoute,
//   type ContractDefinition,
//   HeaderBuilder,
//   type Headers,
//   type NoHeaders,
//   type RouterDetails,
// } from '@lokalise/api-contracts'
// import wretch, { type Wretch, type WretchOptions } from 'wretch'
// import { sendByDeleteRoute, sendByGetRoute, sendByPayloadRoute } from './client.js'
// import { z } from 'zod/v4'
//
// const NO_HEADERS_BUILDER = HeaderBuilder.create<NoHeaders>()
//
// function resolveServiceName<AvailableService extends string>(service: AvailableService) {
//   return Promise.resolve(service ? `/${service}` : '')
// }
//
// async function buildWretchClient<AvailableService extends string>(
//   service: AvailableService,
//   options?: WretchOptions,
// ) {
//   return wretch(await resolveServiceName(service), options)
// }
//
// type Options<InstanceHeaders extends Headers = NoHeaders> = {
//   instanceHeaders?: HeaderBuilder<InstanceHeaders>
//   wretchOptions?: WretchOptions
// }
//
// export function initializeContractService<
//   Router extends AnyRouter,
//   ContractHeaders extends Headers = NoHeaders,
//   InstanceHeaders extends Headers = NoHeaders,
// >(
//   definition: ContractDefinition<AvailableService, Router, ContractHeaders>,
//   options: Options<InstanceHeaders> = {},
// ) {
//   // Deliberately not waiting for the promise to resolve here so that this function can be used in a synchronous context
//   // While still allowing the client to be created asynchronously, and only once
//   const clientCache = buildWretchClient(definition.service, options.wretchOptions)
//
//   const additionalHeaders = HeaderBuilder.create().merge(
//     definition.contractHeaderBuilder ?? NO_HEADERS_BUILDER,
//   )
//
//   const contractServiceInstance = {} as {
//     [K in keyof Router]: ReturnType<
//       typeof createContractMethod<
//         Client,
//         Router[K],
//         HeaderBuilder<ContractHeaders>,
//         HeaderBuilder<InstanceHeaders>,
//         (typeof resolvers)[Router[K]['route']['method']]
//       >
//     >
//   }
//
//   for (const key in definition.router) {
//     contractServiceInstance[key] = async (params: GetRequestParametersFrom<any, any>) => {
//       const config = definition.router[key]
//
//       // This is not possible if tsc passes for the input, but is required to satisfy TypeScript's optional key dereferencing checks
//       if (config === undefined) {
//         throw new Error(`Route ${String(key)} is not defined in the contract`)
//       }
//
//       const { route, headers: requestHeaders } = config
//
//       const [client, headers] = await Promise.all([
//         clientCache,
//
//         additionalHeaders
//           .merge(requestHeaders ?? NO_HEADERS_BUILDER)
//           .merge(options?.instanceHeaders ?? NO_HEADERS_BUILDER)
//           .merge(params.headers ?? NO_HEADERS_BUILDER)
//           .resolve(),
//       ])
//
//       switch (route.method) {
//         case 'get':
//           return sendByGetRoute(client, route, { ...params, headers })
//
//         case 'delete':
//           return sendByDeleteRoute(client, route, { ...params, headers })
//
//         case 'patch':
//         case 'post':
//         case 'put':
//           return sendByPayloadRoute(client, route, { ...params, headers })
//       }
//     }
//   }
//
//   return contractServiceInstance
// }
//
// /**
//  * <
//  *   T extends WretchInstance,
//  *   ResponseBodySchema extends z.Schema | undefined = undefined,
//  *   PathParamsSchema extends z.Schema | undefined = undefined,
//  *   RequestQuerySchema extends z.Schema | undefined = undefined,
//  *   RequestHeaderSchema extends z.Schema | undefined = undefined,
//  *   IsNonJSONResponseExpected extends boolean = false,
//  *   IsEmptyResponseExpected extends boolean = false,
//  * >
//  */
//
// type DoGetParamerter<Route extends AnyGetRoute> = Parameters<
//   typeof sendByGetRoute<
//     Wretch,
//     Route['successResponseBodySchema'],
//     Route['requestPathParamsSchema'],
//     Route['requestQuerySchema'],
//     Route['requestHeaderSchema'],
//     Route['isNonJSONResponseExpected'],
//     Route['isEmptyResponseExpected']
//   >
// >[2]
//
// type DoGetReturnType<Route extends AnyGetRoute> = ReturnType<
//   typeof sendByGetRoute<
//     Wretch,
//     Route['successResponseBodySchema'],
//     Route['requestPathParamsSchema'],
//     Route['requestQuerySchema'],
//     Route['requestHeaderSchema'],
//     Route['isNonJSONResponseExpected'],
//     Route['isEmptyResponseExpected']
//   >
// >
//
// type TheReturnTYpe<Route extends AnyGetRoute> = (
//   params: DoGetParamerter<Route>,
// ) => DoGetReturnType<Route>
//
// const BODY_SCHEMA = z.object({})
// const PATH_PARAMS_SCHEMA = z.object({
//   userId: z.string(),
// })
// const PATH_PARAMS_MULTI_SCHEMA = z.object({
//   userId: z.string(),
//   orgId: z.string(),
// })
//
// const contract = buildGetRoute({
//   successResponseBodySchema: BODY_SCHEMA,
//   description: 'some description',
//   responseSchemasByStatusCode: {
//     200: BODY_SCHEMA,
//     400: z.object({ message: z.string() }),
//   },
//   pathResolver: () => '/',
// })
//
// type d = TheReturnTYpe<typeof contract>
// declare const a: d
//
// a({
//   headers: HeaderBuilder.create(),
// })
//
// function makeThing<
//   const Route extends AnyRoute,
//   const ContractHeaders extends Headers,
//   const InstanceHeaders extends Headers = NoHeaders,
// >(
//   routerDetails: RouterDetails<Route>,
//   clientCache: Promise<Wretch>,
//   contractHeaders: HeaderBuilder<ContractHeaders>,
//   instanceHeaders: HeaderBuilder<InstanceHeaders> | undefined,
// ) {
//   return async (params: GetRequestParametersFrom<any, any>) => {
//     const { route, headers: routerConfigHeaders } = routerDetails
//
//     const [client, headers] = await Promise.all([
//       clientCache,
//
//       contractHeaders
//         .merge(routerConfigHeaders ?? NO_HEADERS_BUILDER)
//         .merge(instanceHeaders ?? NO_HEADERS_BUILDER)
//         .merge(params.headers ?? NO_HEADERS_BUILDER)
//         .resolve(),
//     ])
//
//     switch (route.method) {
//       case 'get':
//         return sendByGetRoute(client, route, { ...params, headers })
//
//       case 'delete':
//         return sendByDeleteRoute(client, route, { ...params, headers })
//
//       case 'patch':
//       case 'post':
//       case 'put':
//         return sendByPayloadRoute(client, route, { ...params, headers })
//     }
//   }
// }
//
// async function doGetThing<
//   const Route extends AnyGetRoute,
//   ContractHeaders extends Headers = NoHeaders,
//   InstanceHeaders extends Headers = NoHeaders,
//   ParamHeaders extends Headers = NoHeaders,
// >(
//   router: RouterDetails<Route>,
//   clientCache: Promise<Wretch>,
//   contractHeaders: HeaderBuilder<ContractHeaders>,
//   instanceHeaders: HeaderBuilder<InstanceHeaders> | undefined,
//   paramHeaders: HeaderBuilder<ParamHeaders> | undefined,
// ) {
//   const { client, headers, route } = await doPreAmble(
//     router,
//     clientCache,
//     contractHeaders,
//     instanceHeaders,
//     paramHeaders,
//   )
//
//   return sendByGetRoute(client, route, {})
// }
//
// async function doPreAmble<
//   const Route extends AnyRoute,
//   ContractHeaders extends Headers = NoHeaders,
//   InstanceHeaders extends Headers = NoHeaders,
//   ParamHeaders extends Headers = NoHeaders,
// >(
//   router: RouterDetails<Route>,
//   clientCache: Promise<Wretch>,
//   contractHeaders: HeaderBuilder<ContractHeaders>,
//   instanceHeaders: HeaderBuilder<InstanceHeaders> | undefined,
//   paramHeaders: HeaderBuilder<ParamHeaders> | undefined,
// ) {
//   const { route, headers: requestHeaders } = router
//
//   const [client, headers] = await Promise.all([
//     clientCache,
//
//     contractHeaders
//       .merge(requestHeaders ?? NO_HEADERS_BUILDER)
//       .merge(instanceHeaders ?? NO_HEADERS_BUILDER)
//       .merge(paramHeaders ?? NO_HEADERS_BUILDER)
//       .resolve(),
//   ])
//
//   return { client, headers, route }
// }
