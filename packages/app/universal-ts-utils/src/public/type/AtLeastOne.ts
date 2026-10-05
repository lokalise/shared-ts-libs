/**
 * Constructs a type that requires at least one of the properties of `T` to be present,
 * while the rest stay optional.
 *
 * @template T - The object type whose properties should be required at least once.
 *
 * @example
 * ```typescript
 * type Filter = AtLeastOne<{ id: string; name: string }>
 *
 * const byId: Filter = { id: '1' }
 * const byBoth: Filter = { id: '1', name: 'Alice' }
 * // @ts-expect-error at least one property is required
 * const empty: Filter = {}
 * ```
 */
export type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]
