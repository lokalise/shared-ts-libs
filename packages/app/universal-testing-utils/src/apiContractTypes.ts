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
// The `Extract` keeps this resolvable against pre-visibility `@lokalise/api-contracts` peers
// (<7.2), where `ApiContract` has no `visibility` key: the type degrades to `{}` there, so
// `ClientCompatibleContract` becomes a no-op instead of a compile error.
export type ServerOnlyContractFields = Pick<ApiContract, Extract<keyof ApiContract, 'visibility'>>

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
