/**
 * A type representing the values of an object type `T`.
 *
 * This type extracts all possible value types from a given object,
 * allowing for type-safe usage when accessing the values.
 *
 * @template T - The object type from which to extract the values. Must extend `object`.
 *
 * @example
 * ```typescript
 * export const MyTypeEnum = { OPTION_A: 'optionA', OPTION_B: 'optionB' } as const;
 * export type MyType = ObjectValues<typeof MyTypeEnum>;
 *
 * const myValue: MyType = 'optionA'; // valid usage
 * const invalidValue: MyType = 'invalid'; // TypeScript error
 * ```
 */
export type ObjectValues<T extends object> = T[keyof T]
