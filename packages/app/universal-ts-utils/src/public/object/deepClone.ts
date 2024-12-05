/**
 * Returns a deep cloned copy of an object.
 *
 * This function utilizes the `structuredClone` method, which is capable of deep cloning complex objects,
 * including nested structures. However, it has limitations and does not support cloning functions,
 * Error objects, WeakMap, WeakSet, DOM nodes, and certain other browser-specific objects like Window.
 *
 * @param {object} object - The object to be deeply cloned. If the object is `undefined` or `null`, it returns the object as is.
 * @return {object} A deep clone of the input object, or the input itself if it is `undefined` or `null`.
 *
 */
export const deepClone = <T extends object | undefined | null>(object: T): T =>
  object ? structuredClone(object) : object
