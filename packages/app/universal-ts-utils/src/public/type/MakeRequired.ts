/**
 * Makes specified keys required and non-nullable in a type, while keeping the rest of the keys as they are.
 * Removes both optional (`?`) and null/undefined from the specified keys.
 *
 * @template T - The original type with properties to be adjusted for required status.
 * @template K - A union of keys in the type `T` that should be made required and non-nullable.
 *
 * @example
 * ```typescript
 * type Config = {
 *   host?: string | null
 *   port?: number
 *   secure?: boolean
 * }
 * type StrictConfig = MakeRequired<Config, 'host'>
 *
 * const config1: StrictConfig = { host: "localhost" } // ✓
 * const config2: StrictConfig = { host: "localhost", secure: true } // ✓
 * const config3: StrictConfig = { host: null } // ✗ Error: null is not allowed
 * ```
 */
export type MakeRequired<T, K extends keyof T> = {
  [P in K]-?: NonNullable<T[P]>
} & Omit<T, K>
