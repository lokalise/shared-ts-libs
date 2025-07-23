/**
 * Asserts that the provided value is of type `never` and will cause a TypeScript error if it is not.
 * The goal of this is to error at build time if there is a case that is not covered.
 * There is a fallback for runtime is something sneaks though. We are not trying to determine if something
 * is `never` (i.e. `(value: unknown): value is never => {...}`) – we are, instead, trying to catch the case
 * that something is not `never` when we expect it to be. In reality, this should ALWAYS be unreachable code.
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
  let stringValue: string = `${value}`

  try {
    // biome-ignore lint/suspicious/noExplicitAny: We should never here, but is a case has been missed this will not be never..
    stringValue = typeof (value as any) === 'string' ? `"${value}"` : JSON.stringify(value)
  } catch (_error) {
    // If JSON.stringify fails, we fall back to the default string representation
  }

  throw new Error(`Unexpected value: ${stringValue}.`)
}
