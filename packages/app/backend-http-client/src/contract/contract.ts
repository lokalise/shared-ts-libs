import type {
  AnyDeleteRoute,
  AnyGetRoute,
  AnyPayloadRoute,
  AnyRoutes,
  ContractDefinitions,
  NoHeaders,
} from '@lokalise/api-contracts'
import { assertIsNever } from '@lokalise/universal-ts-utils/node'
import type { Client } from 'undici'
import { sendByDeleteRoute, sendByGetRoute, sendByPayloadRoute } from '../client/httpClient.js'
import type {
  AnyRouteOptions,
  AnyRouteParameters,
  ContractService,
  PayloadRouteParameters,
} from './types.js'

type RouteOptions<Routers extends AnyRoutes> = {
  [K in keyof Routers]: AnyRouteOptions<Routers[K]['route']>
}

export function createContractService<
  const Routes extends AnyRoutes,
  const C extends Client,
  const ContractHeaders extends Headers = NoHeaders,
>(
  definition: ContractDefinitions<Routes>,
  clientResolver: (service: string) => Promise<C>,
  contractHeaders?: ContractHeaders | (() => ContractHeaders) | (() => Promise<ContractHeaders>),
  defaultOptions?: Partial<RouteOptions<Routes>>,
): ContractService<Routes, ContractHeaders> {
  const service = {} as Partial<ContractService<Routes, ContractHeaders>>

  //   // Intentionally not awaiting the clientResolver
  const clientCache = clientResolver(definition.serviceName)
  const contractHeadersCache =
    typeof contractHeaders === 'function' ? contractHeaders() : (contractHeaders ?? ({} as Headers))

  for (const key in definition.config.routes) {
    const routeConfig = definition.config.routes[key]

    if (routeConfig === undefined) {
      throw new Error(`Route ${key} is not defined in the contract`)
    }

    const route = routeConfig.route

    // @ts-ignore
    // Is there a way to not need the `@ts-ignore` here?
    service[key] = async (
      params: AnyRouteParameters<typeof route, ContractHeaders>,
      options: AnyRouteOptions<typeof route>,
    ) => {
      const client = await clientCache

      const resolvedHeaders = await Promise.all([
        contractHeadersCache,
        'headers' in params ? (params.headers as Headers) : Promise.resolve({} as Headers),
      ])

      const headers: Headers = resolvedHeaders.reduce(
        // biome-ignore lint/performance/noAccumulatingSpread: This is a clean way to merge headers
        (acc, headers) => ({ ...acc, ...headers }),
        {} as Headers,
      )

      const requestOptions = {
        ...defaultOptions?.[key],
        ...options,
      }

      switch (route.method) {
        case 'get':
          return sendByGetRoute(
            client,
            route as AnyGetRoute,
            { ...params, headers },
            requestOptions,
          )

        case 'delete':
          return sendByDeleteRoute(
            client,
            route as AnyDeleteRoute,
            { ...params, headers },
            requestOptions,
          )

        case 'post':
        case 'put':
        case 'patch':
          return sendByPayloadRoute(
            client,
            route as AnyPayloadRoute,
            {
              ...(params as PayloadRouteParameters<typeof route, ContractHeaders>),
              headers,
            },
            requestOptions,
          )

        default:
          assertIsNever(route)
      }
    }
  }

  return service as ContractService<Routes, ContractHeaders>
}
