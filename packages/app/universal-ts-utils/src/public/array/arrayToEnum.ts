type ArrayEnum<T extends Readonly<string[]>> = { [K in T[number]]: K }

/**
 * Converts an array of strings into an enum-like object where keys and values are the same.
 *
 * This function takes a readonly array of strings and creates an object where each string
 * becomes both a key and its corresponding value. This is useful for creating type-safe
 * enums from string arrays, similar to TypeScript's const enums.
 *
 * @template T - A readonly array type of string literals.
 * @param {T} array - The array of strings to convert into an enum-like object.
 * @returns {{ [K in T[number]]: K }} - An object where each string from the array is both a key and value.
 *
 * @example
 * ```typescript
 * const fruits = ['apple', 'banana', 'orange'] as const
 * const fruitEnum = arrayToEnum(fruits)
 * // Returns: { apple: 'apple', banana: 'banana', orange: 'orange' }
 * // Type: { apple: 'apple', banana: 'banana', orange: 'orange' }
 * ```
 */
export const arrayToEnum = <T extends Readonly<string[]>>(array: T): ArrayEnum<T> => {
  return array.reduce(
    (acc, key) => {
      acc[key as T[number]] = key as T[number]
      return acc
    },
    {} as ArrayEnum<T>,
  )
}
