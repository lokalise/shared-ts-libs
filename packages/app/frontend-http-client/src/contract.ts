import {
  type AnyDeleteRoute,
  type AnyGetRoute,
  type AnyPayloadRoute,
  type AnyRoutes,
  type ContractDefinitions,
  HeaderBuilder,
  type Headers,
  type NoHeaders,
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
  contractHeaders?: HeaderBuilder<ContractHeaders>,
): ContractService<Routes, ContractHeaders> {
  const service = {} as Partial<ContractService<Routes, ContractHeaders>>

  // Intentionally not awaiting the clientResolver
  const clientCache = clientResolver(definition.serviceName)
  const contractHeadersCache = contractHeaders?.resolve() ?? Promise.resolve({})

  for (const key in definition.config.routes) {
    const routeConfig = definition.config.routes[key]

    if (routeConfig === undefined) {
      throw new Error(`Route ${key} is not defined in the contract`)
    }

    const route = routeConfig.route

    // biome-ignore lint/suspicious/noExplicitAny: This is to get around TypeScript's limitation of assignment of generic records
    ;(service as any)[key] = async (params: AnyRouteParameters<typeof route, ContractHeaders>) => {
      const client = await clientCache

      const headers = HeaderBuilder.create('headers' in params ? (params.headers as Headers) : {})
        .and(contractHeadersCache)
        .resolve()

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
