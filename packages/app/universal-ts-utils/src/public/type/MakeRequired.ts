/**
 * Makes specified keys required in a type, while keeping the rest of the keys as they are.
 *
 * @template T - The original type with properties to be adjusted for required status.
 * @template K - A union of keys in the type `T` that should be made required.
 *
 * @example
 * ```typescript
 * type Config = {
 *   host?: string
 *   port?: number
 *   secure?: boolean
 * }
 * type StrictConfig = MakeRequired<Config, 'host'>
 *
 * const config1: StrictConfig = { host: "localhost" }
 * const config2: StrictConfig = { host: "localhost", secure: true }
 * ```
 */
export type MakeRequired<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>
