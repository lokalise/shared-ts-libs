/**
 * Returns a deep cloned copy of an object.
 *
 * This function utilizes the `structuredClone` method, which is capable of deep cloning complex objects, including
 * nested structures. However, it has limitations and does not support cloning functions, Error objects, WeakMap,
 * WeakSet, DOM nodes, and certain other browser-specific objects like Window.
 *
 * @remarks When using `structuredClone`, be aware of its limitations. It cannot clone functions, Error objects,
 * certain web platform objects, and symbols, among others. For such cases, consider using custom cloning logic.
 *
 * @template T - The type of the object to clone, which can be an object, `undefined`, or `null`.
 * @param {T} object - The object to be deeply cloned. If the object is `undefined` or `null`, it returns the object as is.
 * @returns {T} A deep clone of the input object, or the input itself if it is `undefined` or `null`.
 *
 * @example
 * ```typescript
 * const original = { name: 'Alice', details: { age: 30 } }
 * const cloned = deepClone(original)
 * // cloned will be a deep copy of original, and modifying cloned will not affect original
 * ```
 */
export const deepClone = <T extends object | undefined | null>(object: T): T =>
  object ? structuredClone(object) : object
