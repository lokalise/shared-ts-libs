/**
 * Flattens an intersection type into a single object type, making hover tooltips
 * show the fully-resolved shape instead of `A & B & C`.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

/**
 * Returns true when T is a union with more than one member.
 */
export type IsUnion<T, U = T> = (T extends unknown ? ([U] extends [T] ? 0 : 1) : never) extends 0
  ? false
  : true

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
