import type {
  AnyDeleteRoute,
  AnyGetRoute,
  AnyPayloadRoute,
  AnyRoutes,
  ContractDefinitions,
  Headers,
  NoHeaders,
} from '@lokalise/api-contracts'
import { assertIsNever } from '@lokalise/universal-ts-utils/node'
import type { Wretch } from 'wretch'
import { sendByDeleteRoute, sendByGetRoute, sendByPayloadRoute } from './client.js'
import type { AnyRouteParameters, ContractService, PayloadRouteParameters } from './types.js'

export function createContractService<
  const Routes extends AnyRoutes,
  const Client extends Wretch,
  const ContractHeaders extends Headers = NoHeaders,
>(
  definition: ContractDefinitions<Routes>,
  clientResolver: (service: string) => Promise<Client>,
  contractHeaders?: ContractHeaders | (() => ContractHeaders) | (() => Promise<ContractHeaders>),
): ContractService<Routes, ContractHeaders> {
  const service = {} as Partial<ContractService<Routes, ContractHeaders>>

  // Intentionally not awaiting the clientResolver
  const clientCache = clientResolver(definition.serviceName)
  const contractHeadersCache =
    typeof contractHeaders === 'function' ? contractHeaders() : (contractHeaders ?? ({} as Headers))

  for (const key in definition.config.routes) {
    const routeConfig = definition.config.routes[key]

    if (routeConfig === undefined) {
      throw new Error(`Route ${key} is not defined in the contract`)
    }

    const route = routeConfig.route

    // biome-ignore lint/suspicious/noExplicitAny: This is to get around TypeScript's limitation of assignment of generic records
    ;(service as any)[key] = async (params: AnyRouteParameters<typeof route, ContractHeaders>) => {
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

      switch (route.method) {
        case 'get':
          return sendByGetRoute(client, route as AnyGetRoute, { ...params, headers })

        case 'delete':
          return sendByDeleteRoute(client, route as AnyDeleteRoute, { ...params, headers })

        case 'post':
        case 'put':
        case 'patch':
          return sendByPayloadRoute(client, route as AnyPayloadRoute, {
            ...(params as PayloadRouteParameters<AnyPayloadRoute, ContractHeaders>),
            headers,
          })

        default:
          assertIsNever(route)
      }
    }
  }

  return service as ContractService<Routes, ContractHeaders>
}
