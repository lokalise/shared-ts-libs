type DatesAsString<T> = T extends Date ? string : ExactlyLikeWithDateAsString<T>

type ExactlyLikeWithDateAsString<T> = T extends object ? { [K in keyof T]: DatesAsString<T[K]> } : T

/**
 * Recursively converts all Date fields in an object or array of objects to ISO string format.
 * This function retains the structure of the input, ensuring non-Date fields remain unchanged,
 * while Date fields are replaced with their ISO string representations.
 *
 * @param {object | object[]} input - The object or array of objects to convert.
 * @returns {object | object[]} A new object or array of objects with Date fields as ISO strings.
 *
 * @example
 *```typescript
 * const obj = { id: 1, created: new Date(), meta: { updated: new Date() } }
 * const result = convertDateFieldsToIsoString(objj)
 * console.log(result) // { id: 1, created: '2024-01-01T00:00:00.000Z', meta: { updated: '2024-01-01T00:00:00.000Z' } }
 * ```
 */
export function convertDateFieldsToIsoString<Input extends object>(
  object: Input,
): ExactlyLikeWithDateAsString<Input>
export function convertDateFieldsToIsoString<Input extends object>(
  object: Input[],
): ExactlyLikeWithDateAsString<Input>[]
export function convertDateFieldsToIsoString<Input extends object>(
  object: Input | Input[],
): ExactlyLikeWithDateAsString<Input> | ExactlyLikeWithDateAsString<Input>[] {
  if (Array.isArray(object)) object.map(internalConvert)

  return Object.entries(object).reduce(
    (result, [key, value]) => {
      // @ts-expect-error
      result[key] = internalConvert(value)
      return result
    },
    {} as ExactlyLikeWithDateAsString<Input>,
  )
}

const internalConvert = <T>(item: T): DatesAsString<T> => {
  // @ts-expect-error
  if (item instanceof Date) return item.toISOString()
  // @ts-expect-error
  if (item && typeof item === 'object') return convertDateFieldsToIsoString(item)

  // @ts-expect-error
  return item
}
