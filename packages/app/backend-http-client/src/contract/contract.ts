import type { AnyRoutes, ContractDefinitions, Headers } from '@lokalise/api-contracts'
import {
  type AnyDeleteRoute,
  type AnyGetRoute,
  type AnyPayloadRoute,
  type ConfiguredContractService,
  HeaderBuilder,
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
  const ContractHeaders extends Headers,
  Configured extends ConfiguredContractService<
    Client,
    ContractDefinitions<AnyRoutes>,
    ContractHeaders
  >,
>(
  contract: Configured,
  defaultOptions?: Partial<RouteOptions<Configured['definition']['routes']>>,
): ContractService<Configured> {
  const service = {} as Partial<ContractService<Configured>>

  for (const key in contract.definition.routes) {
    const route = contract.definition.routes[key]?.route

    if (route === undefined) {
      throw new Error(`Route ${key} is not defined in the contract`)
    }

    // @ts-ignore
    // Is there a way to not need the `@ts-ignore` here?
    service[key] = async (
      params: AnyRouteParameters<typeof route, ContractHeaders>,
      options: AnyRouteOptions<typeof route>,
    ) => {
      const prepared = contract.prepared[key]
      if (!prepared) {
        throw new Error(`Route ${key} is not prepared`)
      }

      const { client, route, headers: contractHeaders } = await prepared

      const headers = HeaderBuilder.create('headers' in params ? (params.headers as Headers) : {})
        .and(contractHeaders)
        .resolve()

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

  return service as ContractService<Configured>
}
