type DatesAsString<T> = T extends Date ? string : ExactlyLikeWithDateAsString<T>

type ExactlyLikeWithDateAsString<T> = T extends object ? { [K in keyof T]: DatesAsString<T[K]> } : T

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
