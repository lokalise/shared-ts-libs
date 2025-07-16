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

export function definedContract(
  service: string,
  routes: AnyRoutes,
): ContractDefinitions<typeof routes> {
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
      headers: ContractHeaders
      route: Definition['routes'][K]['route']
    }>
  }
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

  const prepared = {} as {
    [K in keyof Definition['routes']]: Promise<{
      client: Client
      headers: ContractHeaders
      route: Definition['routes'][K]['route']
    }>
  }

  for (const key in definition.routes) {
    const router = definition.routes[key]
    if (router === undefined) {
      throw new Error(`Route ${String(key)} is not defined in the contract`)
    }

    prepared[key as keyof Definition['routes']] = Promise.all([
      clientCache,
      contractHeadersBuilder.resolve(),
    ]).then(([client, headers]) => ({
      client,
      headers,
      route: router.route,
    }))
  }

  return { definition, contractHeaders: contractHeadersBuilder, prepared }
}
