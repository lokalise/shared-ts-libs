/**
 * Helper to prevent extra keys. If T has keys not in U, it forces an error.
 */
export type Exactly<T, U> = T & {
  [K in keyof T]: K extends keyof U ? T[K] : never
}

/**
 * Extracts a union of value types from an object type.
 * Optionally constrained to a subset of keys via ValueType.
 */
export type ValueOf<
  ObjectType,
  ValueType extends keyof ObjectType = keyof ObjectType,
> = ObjectType[ValueType]
