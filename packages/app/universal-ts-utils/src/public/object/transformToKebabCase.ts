type TransformToKebabCaseInputType = Record<string, unknown> | null | undefined
type TransformToKebabCaseReturnType<Input, Output> = Input extends Record<string, unknown>
  ? Output
  : Input
/**
 * Transforms an object's keys from camelCase or snake_case to kebab-case.
 * @param object
 */
export function transformToKebabCase<
  Output extends Record<string, unknown>,
  Input extends TransformToKebabCaseInputType,
>(object: Input): TransformToKebabCaseReturnType<Input, Output>
export function transformToKebabCase<
  Output extends Record<string, unknown>,
  Input extends TransformToKebabCaseInputType,
>(object: Input[]): TransformToKebabCaseReturnType<Input, Output>[]
export function transformToKebabCase<Output, Input>(
  object: Input | Input[],
): TransformToKebabCaseReturnType<Input, Output> | TransformToKebabCaseReturnType<Input, Output>[] {
  if (Array.isArray(object)) {
    return object.map(transformToKebabCase) as TransformToKebabCaseReturnType<Input, Output>[]
  }

  if (typeof object !== 'object' || object === null || object === undefined) {
    return object as TransformToKebabCaseReturnType<Input, Output>
  }

  return Object.entries(object as Record<string, unknown>).reduce(
    (result, [key, value]) => {
      result[transformKey(key)] =
        value && typeof value === 'object'
          ? transformToKebabCase(value as TransformToKebabCaseInputType)
          : value
      return result
    },
    {} as Record<string, unknown>,
  ) as TransformToKebabCaseReturnType<Input, Output>
}

const transformKey = (key: string): string =>
  key
    .replace(/([a-z])([A-Z])/g, '$1-$2') // transforms basic camelCase
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // transforms abbreviations
    .replace(/_/g, '-') // transforms snake_case
    .toLowerCase() // finally lowercase all
