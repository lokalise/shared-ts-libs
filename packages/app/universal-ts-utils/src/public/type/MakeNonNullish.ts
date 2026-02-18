/**
 * Makes specified keys required and non-nullable in a type, while keeping the rest of the keys as they are.
 * Removes both the optional modifier (`?`) and `null`/`undefined` from the specified keys.
 *
 * @template T - The original type with properties to be adjusted.
 * @template K - A union of keys in the type `T` that should be made required and non-nullable.
 *
 * @example
 * ```typescript
 * type Config = {
 *   host?: string | null
 *   port?: number
 *   secure?: boolean
 * }
 * type StrictConfig = MakeNonNullish<Config, 'host'>
 *
 * const config1: StrictConfig = { host: "localhost" } // ✓
 * const config2: StrictConfig = { host: "localhost", secure: true } // ✓
 * const config3: StrictConfig = { host: null } // ✗ Error: null is not allowed
 * ```
 */
export type MakeNonNullish<T, K extends keyof T> = {
  [P in K]-?: NonNullable<T[P]>
} & Omit<T, K>