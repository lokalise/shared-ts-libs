import type { RecordKeyType } from '../../internal/types.ts'

/**
 * A type representing a record with keys of a specified type and values of any type.
 *
 * This type is useful for creating flexible data structures where the key types
 * can be constrained to a specific set of values (for example, union of string literals, numbers, etc.)
 * while allowing the values to be of any type.
 *
 * @template Key - The type of the keys in the record. Defaults to `string`.
 *
 * @example
 * ```typescript
 * const stringKeyRecord: FreeformRecord = { name: "Alice", age: 30 }
 * const numberKeyRecord: FreeformRecord<number> = { 1: "one", 2: "two" }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: 'FreeformRecord' is a type alias for a record with string keys and any values
export type FreeformRecord<Key extends RecordKeyType = string> = Record<Key, any>
