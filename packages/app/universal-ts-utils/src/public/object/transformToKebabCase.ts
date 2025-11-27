type TransformToKebabCaseInputType = Record<string, unknown> | null | undefined
type TransformToKebabCaseReturnType<Input, Output> =
  Input extends Record<string, unknown> ? Output : Input

/**
 * Transforms the keys of an object or array of objects from camelCase or snake_case to kebab-case.
 * This transformation is applied recursively, ensuring any nested objects are also processed.
 * Non-object inputs are returned unchanged.
 *
 * @param {Record<string, unknown> | Record<string, unknown>[]} object - The object(s) whose keys will be transformed.
 * @returns {Record<string, unknown> | Record<string, unknown>[]} The object(s) with keys converted to kebab-case.
 *
 * @example
 * ```typescript
 * const obj = { myId: 1, creationId: 1, metaObj: { updateId: 1 } }
 * const result = transformToKebabCase(obj)
 * console.log(result) // Returns: { 'my-id': 1, 'creation-date': 1, meta-obj: { 'update-date': 1 } }
 * ```
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
