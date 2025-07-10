import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  PayloadRouteDefinition,
} from './apiContracts.js'
import { HeaderBuilder, type Headers, type NoHeaders } from './headers/headerBuilder.js'

export type AnyGetRoute = GetRouteDefinition<any, any, any, any, any, any>
export type AnyDeleteRoute = DeleteRouteDefinition<any, any, any, any, any, any>
export type AnyPayloadRoute = PayloadRouteDefinition<any, any, any, any, any, any>
export type AnyRoute = AnyGetRoute | AnyDeleteRoute | AnyPayloadRoute

export type RouteDetails<Route extends AnyRoute> = {
  route: Route
}

export type AnyRoutes = { [key: string]: RouteDetails<AnyRoute> }

export type ContractDefinitions<Routes extends AnyRoutes> = {
  serviceName: string
  routes: Routes
}

export function definedContract<Routes extends AnyRoutes>(
  service: string,
  routes: Routes,
): ContractDefinitions<Routes> {
  return { serviceName: service, routes }
}

export type ConfiguredContractService<
  Client,
  Definition extends ContractDefinitions<AnyRoutes>,
  ContractHeaders extends Headers = NoHeaders,
> = {
  definition: Definition
  contractHeaders: HeaderBuilder<ContractHeaders>
  prepared: {
    [K in keyof Definition['routes']]: Promise<{
      client: Client
      route: Definition['routes'][K]['route']
      headers: ContractHeaders
    }>
  }
  // service: {
  //   [K in keyof Definition['routes']]: <R>(
  //     fn: (
  //       client: Client,
  //       route: Definition['routes'][K]['route'],
  //       headerBuilder: HeaderBuilder<ContractHeaders>,
  //     ) => Promise<R>,
  //   ) => Promise<R>
  // }
}

export function configureContractService<
  Client,
  Definition extends ContractDefinitions<AnyRoutes>,
  ContractHeaders extends Headers = NoHeaders,
>(
  definition: Definition,
  clientResolver: (service: string) => Promise<Client>,
  contractHeaders?: HeaderBuilder<ContractHeaders>,
): ConfiguredContractService<Client, Definition, ContractHeaders> {
  const clientCache = clientResolver(definition.serviceName)
  const contractHeadersBuilder = contractHeaders ?? HeaderBuilder.create<ContractHeaders>()

  // const serviceMethods = {} as Partial<{
  //   [K in keyof Definition['routes']]: ConfiguredContractService<
  //     Client,
  //     Definition,
  //     ContractHeaders
  //   >['service'][K]
  // }>

  const prepared = {} as {
    [K in keyof Definition['routes']]: Promise<{
      client: Client
      route: Definition['routes'][K]['route']
      headers: ContractHeaders
    }>
  }

  for (const key in definition.routes) {
    // serviceMethods[key as keyof Definition['routes']] = async (fn) => {
    //   const route = definition.routes[key]?.route
    //   if (route === undefined) {
    //     throw new Error(`Route ${String(key)} is not defined in the contract`)
    //   }
    //
    //   const client = await clientCache
    //
    //   return fn(client, route, contractHeadersBuilder)
    // }

    const route = definition.routes[key]?.route
    if (route === undefined) {
      throw new Error(`Route ${String(key)} is not defined in the contract`)
    }

    prepared[key as keyof Definition['routes']] = Promise.all([
      route,
      clientCache,
      contractHeadersBuilder.resolve(),
    ]).then(([route, client, headers]) => ({
      client,
      route,
      headers,
    }))
  }

  return {
    definition,
    contractHeaders: contractHeadersBuilder,
    prepared,
    // service: serviceMethods as ConfiguredContractService<
    //   Client,
    //   Definition,
    //   ContractHeaders
    // >['service'],
  }
}

// import {
//     buildGetRoute,
//     buildPayloadRoute,
//     type DeleteRouteDefinition,
//     type GetRouteDefinition, HeaderBuilder,
//     type Headers,
//     type NoHeaders,
//     type PayloadRouteDefinition,
// } from './apiContracts.js'
// import { z } from 'zod/v4'
//
//
// export type AnyGetRoute = GetRouteDefinition<any, any, any, any, any, any>
// export type AnyDeleteRoute = DeleteRouteDefinition<any, any, any, any, any, any>
// export type AnyPayloadRoute = PayloadRouteDefinition<any, any, any, any, any, any>
// export type AnyRoute = AnyGetRoute | AnyDeleteRoute | AnyPayloadRoute
//
// export type ServiceMethodsFromDefinition<Definition extends ContractDefinition<any>> = keyof Definition['config']['routes']
//
// export type RouteDetails<Route extends AnyRoute> = {
//     route: Route
// }
//
// export type ContractConfiguration = {
//     routes: { [key: string]: RouteDetails<AnyRoute> }
// }
//
// export type ContractDefinition<Config extends ContractConfiguration> = {
//     service: string
//     config: Config
// }
//
// export type InitialisedContractService<
//     Client,
//     Config extends ContractConfiguration,
//     ContractHeaders extends Headers = NoHeaders,
// > = {
//     clientCache: Promise<Client>
//     contractHeaders: HeaderBuilder<ContractHeaders>
//     config: Config
// }
//
// export function defineContract<const Config extends ContractConfiguration>(service: string, config: Config): ContractDefinition<Config> {
//     return { service, config }
// }
//
// const test = defineContract('TestService', {
//     routes: {
//         testing: { route: contract },
//         otherTesting: { route: otherContract },
//     },
// })
//
// type ASd = ServiceMethodsFromDefinition<typeof test>
//
// // import { HeaderBuilder, type Headers, type NoHeaders } from './headers/headerBuilder.js'
// // import {
// //   buildPayloadRoute,
// //   type DeleteRouteDefinition,
// //   type GetRouteDefinition,
// //   type PayloadRouteDefinition,
// // } from './apiContracts.js'
// // import { z } from 'zod/v4'
// //
// // // TODO nic: Move this.
// // const assertNever = (x: never): never => {
// //   throw new Error(`Unexpected object: ${x}`)
// // }
// //
// // const NO_HEADERS_BUILDER = HeaderBuilder.create()
// //
// // type HeadersFromHeaderBuilder<H> = H extends HeaderBuilder<infer O> ? O : never
// //
// //
// // type AnyHttpHandler<Client, Route extends AnyRouter> = (
// //   client: Client,
// //   route: Route,
// //   params: any,
// // ) => Promise<any>
// //
// // export type RouterDetails<Route extends AnyRoute, H extends Headers = NoHeaders> = {
// //   route: Route
// //   headers?: HeaderBuilder<H>
// // }
// //
// // export type AnyGetRouter = Record<string, RouterDetails<AnyGetRoute>>
// // export type AnyDeleteRouter = Record<string, RouterDetails<AnyDeleteRoute>>
// // export type AnyPayloadRouter = Record<string, RouterDetails<AnyPayloadRoute>>
// // export type AnyRouter<Route extends AnyRoute = AnyRoute> = Record<string, RouterDetails<Route>>
// //
// // type ContractConfiguration<
// //   Router extends AnyRouter,
// //   ContractHeaders extends Headers = NoHeaders,
// // > = {
// //   router: Router
// //   contractHeaderBuilder?: HeaderBuilder<ContractHeaders>
// //   // TODO nic: What other options should be here? retry, timeout, etc?
// // }
// //
// //
// // export type ContractDefinition<
// //   Service extends AvailableService,
// //   Router extends AnyRouter,
// //   ContractHeaders extends Headers = NoHeaders,
// // > = {
// //   service: Service
// //   router: Router
// //   contractHeaderBuilder: HeaderBuilder<ContractHeaders>
// // }
// //
// // //  TODO nic: This
// // type GetRequestParametersFrom<Route extends AnyRoute, PreDefinedHeaders extends Headers> = any
// //
// // type GetResponseTypeFrom<Route extends AnyRoute> = Route extends GetRouteDefinition<infer R>
// //   ? R
// //   : Route extends DeleteRouteDefinition<infer R>
// //     ? R
// //     : Route extends PayloadRouteDefinition<any, infer R>
// //       ? R
// //       : never
// //
// // type ContractService<PreDefinedHeaders extends Headers, Route extends AnyRouter> = {
// //   [K in keyof Route]: (
// //     params: GetRequestParametersFrom<Route[K]['route'], PreDefinedHeaders>,
// //   ) => Promise<unknown>
// // }
// //
// // function createContractMethod<
// //   Client,
// //   const Details extends RouterDetails<AnyRoute>,
// //   const PreDefinedHeaders extends HeaderBuilder,
// //   const InstanceHeaders extends HeaderBuilder,
// //   const ResolverFn extends (client: Client, route: Details['route'], params: any) => Promise<any>,
// //   const Ret = Awaited<ReturnType<ResolverFn>>,
// // >(
// //   clientCache: Promise<Client>,
// //   details: Details,
// //   preDefinedHeaders: PreDefinedHeaders,
// //   instanceHeaders: InstanceHeaders,
// //   send: ResolverFn,
// // ) {
// //   return async (
// //     params: GetRequestParametersFrom<
// //       Details['route'],
// //       HeadersFromHeaderBuilder<InstanceHeaders> & HeadersFromHeaderBuilder<PreDefinedHeaders>
// //     >,
// //   ): Promise<Ret> => {
// //     const { route, headers: requestHeaders } = details
// //
// //     const [client, headers] = await Promise.all([
// //       clientCache,
// //
// //       preDefinedHeaders
// //         .merge(requestHeaders ?? NO_HEADERS_BUILDER)
// //         .merge(instanceHeaders ?? NO_HEADERS_BUILDER)
// //         .merge(params.headers ?? NO_HEADERS_BUILDER)
// //         .resolve(),
// //     ])
// //
// //     return send(client, route, { ...params, headers })
// //   }
// // }
// //
// // type PreparedRequest<Client, AdditionalHeaders extends Headers, Route extends AnyRoute> = {
// //   headers: HeaderBuilder<AdditionalHeaders>
// //   client: Client
// //   route: Route
// // }
// //
// // type HeadersFromRouter<Route extends RouterDetails<AnyRoute>> =
// //   Route['headers'] extends HeaderBuilder<infer H> ? H : NoHeaders
// //
// // function createInitializationStrategy<const Client>(
// //   clientResolver: (service: AvailableService) => Promise<Client>,
// // ) {
// //   return <
// //       const Route extends AnyRoute,
// //     ContractHeaders extends Headers = NoHeaders,
// //     InstanceHeaders extends Headers = NoHeaders,
// //     Router extends AnyRouter<Route> = AnyRouter<Route>
// //   >(
// //     definition: ContractDefinition<AvailableService, Router, ContractHeaders>,
// //     instanceHeaders?: HeaderBuilder<InstanceHeaders>,
// //   ) => {
// //     const clientCache = clientResolver(definition.service)
// //
// //     const contractHeaders = definition.contractHeaderBuilder
// //         ?? (NO_HEADERS_BUILDER as HeaderBuilder<ContractHeaders>);
// //
// //     const contractServiceInstance = {} as {
// //       [K in keyof Router]: () => Promise<
// //         PreparedRequest<
// //           Client,
// //           ContractHeaders & InstanceHeaders & HeadersFromRouter<Router[K]>,
// //           Router[K]['route']
// //         >
// //       >
// //     }
// //
// //     for (const key in definition.router) {
// //       contractServiceInstance[key] = async () => {
// //         const config = definition.router[key]
// //
// //         // This is not possible if tsc passes for the input, but is required to satisfy TypeScript's optional key dereferencing checks
// //         if (config === undefined) {
// //           throw new Error(`Route ${String(key)} is not defined in the contract`)
// //         }
// //
// //         const { route, headers: requestHeaders } = config
// //
// //         const a = contractHeaders.merge<InstanceHeaders>(instanceHeaders ?? NO_HEADERS_BUILDER as HeaderBuilder<InstanceHeaders>)
// //
// //         const [client, headers] = await Promise.all([
// //           clientCache,
// //
// //           contractHeaders
// //             .merge(requestHeaders ?? (NO_HEADERS_BUILDER as HeadersFromRouter<typeof definition.router>))
// //             .merge(instanceHeaders ?? (NO_HEADERS_BUILDER as HeaderBuilder<InstanceHeaders>))
// //             .resolve(),
// //         ])
// //
// //         return { client, headers, route }
// //     }
// //
// //     return contractServiceInstance
// //   }
// // }
// //
// // //  TODO nic: This should be in the FE and BE http client libs
// // const initializeContractService = createInitializationStrategy(() => Promise.resolve(null as any))
// //
// // function definedContract<
// //   Service extends AvailableService,
// //   Router extends AnyRouter,
// //   ContractHeaders extends Headers = NoHeaders,
// // >(
// //   name: Service,
// //   config: ContractConfiguration<Router, ContractHeaders>,
// // ): ContractDefinition<Service, Router, ContractHeaders> {
// //   return {
// //     service: name,
// //     router: config.router,
// //     contractHeaderBuilder:
// //       config.contractHeaderBuilder ?? (NO_HEADERS_BUILDER as HeaderBuilder<ContractHeaders>),
// //   }
// // }
// //
// // // ==============================
// // // ==============================
// // // ==============================
// // // ==============================
// //
// // /**
// //  *
// //  * Some kind of service registry - Be that a service (my preference), shared interface, env config, not the point
// //  *
// //  */
// //
// // const AVAILABLE_SERVICES = ['ContributorsApi', 'ProjectsPublicApi'] as const
// // type AvailableService = (typeof AVAILABLE_SERVICES)[number]
// //
// // // This might take the form of a get request, or an env read... Implementation details...
// // function whereIsService(service: AvailableService) {
// //   return Promise.resolve(`path/to/${service}`)
// // }
// //
// // /**
// //  *
// //  * This would be in the shared FE utils - There would be a similar one for BE in the shared BE utils
// //  *
// //  */
// //
// // const wretchClientResolver = (service: AvailableService) =>
// //   whereIsService(service).then((location) => ({ location }))
// //
// // /**
// //  *
// //  * This would be exposed by the service that defined the API (alongside the route definitions)
// //  *
// //  */
// //
// // const BODY_SCHEMA = z.object({})
// // const PATH_PARAMS_SCHEMA = z.object({
// //   userId: z.string(),
// // })
// // const PATH_PARAMS_MULTI_SCHEMA = z.object({
// //   userId: z.string(),
// //   orgId: z.string(),
// // })
// //
// // const contract = buildPayloadRoute({
// //   successResponseBodySchema: BODY_SCHEMA,
// //   requestBodySchema: BODY_SCHEMA,
// //   method: 'post',
// //   description: 'some description',
// //   responseSchemasByStatusCode: {
// //     200: BODY_SCHEMA,
// //     400: z.object({ message: z.string() }),
// //   },
// //   pathResolver: () => '/',
// // })
// //
// // const contributorsContract = definedContract('ContributorsApi', {
// //   router: {
// //     doThing: { route: contract },
// //   },
// //   contractHeaderBuilder: HeaderBuilder.create().add('Authorization', 'Bearer token'),
// // })
// //
// // type InitializedContractDefinition<
// //   Definition extends ContractDefinition<any, any, any>,
// //   Methods extends ResolverMethods,
// // > = {
// //   [K in keyof Definition['router']]: Methods[Definition['router'][K]['route']['method']]
// // }
// //
// // /**
// //  *
// //  * What follows is client code - in this case a web-client
// //  *
// //  */
// //
// // // I can see a word that this is added to the Di Context and/or into a React context. This would make testing SO much easier
// // const contributorsService = initializeContractService(contributorsContract)
// //
// // async function testFoo() {
// //   const { client, headers, route } = await contributorsService.doThing()
// // }
// //
// // // export const TEST = 123
//
