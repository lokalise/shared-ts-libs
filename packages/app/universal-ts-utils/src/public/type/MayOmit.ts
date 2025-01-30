/**
 * Makes specified keys in a type optional, while keeping the rest of the keys as they are.
 *
 * @template T - The original object type with properties to be controlled for optionality.
 * @template K - A union of keys in the type `T` that should be made optional.
 *
 * @example
 * ```typescript
 * type Config = {
 *   host: string;
 *   port: number;
 *   secure: boolean;
 * }
 *
 * type PartialConfig = MayOmit<Config, 'port' | 'secure'>
 *
 * const config1: PartialConfig = { host: "localhost" }
 * const config2: PartialConfig = { host: "localhost", port: 8080 }
 * ```
 */
export type MayOmit<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>
