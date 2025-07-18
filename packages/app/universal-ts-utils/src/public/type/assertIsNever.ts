/**
 * Asserts that the provided value is of type `never` and will cause a TypeScript error if it is not.
 *
 * This is useful for exhaustive type checking in switch statements or conditional types,
 * ensuring that all possible cases have been handled.
 *
 * @param value - The value to assert as `never`.
 * @throws {Error} Throws an error if the value is not of type `never`.
 *
 * @example
 * ```typescript
 * const value: "case1" | "case2" = getSomeValue();
 *
 * switch (value) {
 *   case 'case1':
 *     return 'Handled case1';
 *
 *   case 'case2':
 *     return 'Handled case2';
 *
 *   default:
 *     // This will trigger an error if there are unhandled cases
 *     return assertIsNever(value);
 * }
 * ```
 */
export const assertIsNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}
