import type {
  AnyDualModeContractDefinition,
  AnySSEContractDefinition,
  ApiContract,
  CommonRouteDefinition,
} from '@lokalise/api-contracts'

/**
 * Contract fields that only the serving side acts upon; the testing helpers never read them.
 * Add future mandatory server-side fields here.
 */
export type ServerOnlyContractFields = Pick<ApiContract, 'visibility'>

/**
 * Loosens a route definition's server-only fields to optional, so contracts compiled against
 * older `@lokalise/api-contracts` — whose types lack them (e.g. `visibility` before 7.2) — are
 * still accepted. The testing helpers never read those fields; they only matter on server side.
 */
export type ClientCompatibleContract<
  T extends
    | ApiContract
    | AnyDualModeContractDefinition
    | AnySSEContractDefinition
    // biome-ignore lint/suspicious/noExplicitAny: accepts any route definition shape
    | CommonRouteDefinition<any, any, any, any, any, any, any, any>,
> = Omit<T, keyof ServerOnlyContractFields> & Partial<ServerOnlyContractFields>
