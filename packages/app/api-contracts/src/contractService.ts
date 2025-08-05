import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  PayloadRouteDefinition,
} from './apiContracts.js'

// biome-ignore lint/suspicious/noExplicitAny: This can actually be any type of route
export type AnyGetRoute = GetRouteDefinition<any, any, any, any, any, any>
// biome-ignore lint/suspicious/noExplicitAny: This can actually be any type of route
export type AnyDeleteRoute = DeleteRouteDefinition<any, any, any, any, any, any>
// biome-ignore lint/suspicious/noExplicitAny: This can actually be any type of route
export type AnyPayloadRoute = PayloadRouteDefinition<any, any, any, any, any, any>
export type AnyRoute = AnyGetRoute | AnyDeleteRoute | AnyPayloadRoute

// biome-ignore lint/suspicious/noExplicitAny: This can actually be any type of route
export type AnyCacheKeyFn = (...args: any[]) => Array<any>

export type AnyRoutes = {
  [key: string]: {
    route: AnyRoute
    cacheKey: AnyCacheKeyFn
  }
}

export type ContractDefinitions<Routes extends AnyRoutes> = {
  serviceName: string
  config: { routes: Routes }
}

export function definedContract<R extends AnyRoutes>(
  service: string,
  routes: R,
): ContractDefinitions<R> {
  return { serviceName: service, config: { routes } }
}
