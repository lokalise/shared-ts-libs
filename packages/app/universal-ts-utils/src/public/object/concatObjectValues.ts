import type { ObjectValues } from '../type/ObjectValues.ts'

/**
 * Concatenates the values of a list of objects into a single flat array.
 *
 * This is a readable replacement for the common
 * `[...Object.values(a), ...Object.values(b)]` spread pattern used to combine
 * several keyed-by-name definitions (e.g. event, queue or message maps) into a
 * single array. The returned array is typed as the union of every input
 * object's values, matching what the manual spread produces.
 *
 * @template T - The object type whose values are collected. When the array holds
 * objects of different shapes, `T` is inferred as their union.
 * @param {T[]} objects - The objects whose values should be concatenated.
 * @returns {ObjectValues<T>[]} A flat array with the values of every object.
 *
 * @example
 * ```typescript
 * const supportedEvents = concatObjectValues([
 *   ImportEvents,
 *   ContentManagerEvents,
 *   ExportProcessEvents,
 * ])
 * ```
 */
export const concatObjectValues = <T extends object>(
  objects: T[],
): (T extends unknown ? ObjectValues<T> : never)[] =>
  objects.flatMap((object) => Object.values(object))
