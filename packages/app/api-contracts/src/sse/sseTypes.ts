import type { z } from 'zod/v4'
import type { AnySSEContractDefinition } from './sseContracts.ts'

/**
 * Type constraint for SSE event schemas.
 * Maps event names to their Zod schemas for validation.
 */
export type SSEEventSchemas = Record<string, z.ZodTypeAny>

/**
 * Extract all event names from all contracts as a union of string literals.
 *
 * @example
 * ```typescript
 * type Contracts = {
 *   notifications: { sseEvents: { alert: z.ZodObject<...> } }
 *   chat: { sseEvents: { message: z.ZodObject<...>, done: z.ZodObject<...> } }
 * }
 * // AllContractEventNames<Contracts> = 'alert' | 'message' | 'done'
 * ```
 */
export type AllContractEventNames<Contracts extends Record<string, AnySSEContractDefinition>> =
  Contracts[keyof Contracts]['sseEvents'] extends infer E
    ? E extends SSEEventSchemas
      ? keyof E & string
      : never
    : never

/**
 * Extract the schema for a specific event name across all contracts.
 * Returns the Zod schema for the event, or never if not found.
 */
export type ExtractEventSchema<
  Contracts extends Record<string, AnySSEContractDefinition>,
  EventName extends string,
> = {
  [K in keyof Contracts]: EventName extends keyof Contracts[K]['sseEvents']
    ? Contracts[K]['sseEvents'][EventName]
    : never
}[keyof Contracts]

/**
 * Flatten all events from all contracts into a single record.
 * Used for type-safe event sending across all controller routes.
 */
export type AllContractEvents<Contracts extends Record<string, AnySSEContractDefinition>> = {
  [EventName in AllContractEventNames<Contracts>]: ExtractEventSchema<Contracts, EventName>
}
