import type { BindKey, BindReference, ODataBinds } from '@balena/odata-parser'
import type { FilterValue, RawBindValue } from './types.ts'

/**
 * Resolves a bind reference to its actual value from the binds array.
 * Returns RawBindValue because for 'in' operator, balena parser stores values
 * as an array of bind tuples which gets returned as-is from the default case.
 */
export function resolveBind(binds: ODataBinds, ref: BindReference): RawBindValue {
  const key = ref.bind
  const bind = typeof key === 'number' ? binds[key] : binds[key]

  if (!bind) {
    throw new Error(`Invalid bind reference: ${String(key)}`)
  }

  const [type, value] = bind

  switch (type) {
    case 'Text':
      return value as string
    case 'Real':
      return value as number
    case 'Boolean':
      return value as boolean
    case 'Date':
    case 'Date Time':
      return value instanceof Date ? value : new Date(value as string)
    case 'Null':
      return null
    case 'Duration':
      // Duration is typically returned as a string in ISO 8601 format
      return value as string
    default:
      // For unknown types (including arrays for 'in' operator), return as-is
      return value as RawBindValue
  }
}

/**
 * Resolves multiple bind references to their actual values.
 * Used when we have an array of separate bind refs (e.g., [{ bind: 0 }, { bind: 1 }]).
 * Each individual bind is expected to be a simple value, not an array.
 */
export function resolveBinds(binds: ODataBinds, refs: BindReference[]): FilterValue[] {
  return refs.map((ref) => resolveBind(binds, ref) as FilterValue)
}

/**
 * Checks if a value is a bind reference
 */
export function isBindReference(value: unknown): value is BindReference {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const bindKey = (value as BindReference).bind
  return (
    'bind' in value &&
    (typeof bindKey === 'number' || (typeof bindKey === 'string' && bindKey.startsWith('@')))
  )
}

/**
 * Gets the bind key from a reference (either number index or parameter alias string)
 */
export function getBindKey(ref: BindReference): BindKey {
  return ref.bind
}

/**
 * Checks if a value looks like a bind tuple [type, value]
 */
function isBindTuple(value: unknown): value is [string, unknown] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    // Common OData bind types
    ['Text', 'Real', 'Boolean', 'Date', 'Date Time', 'Null', 'Duration'].includes(value[0])
  )
}

/**
 * Extracts the value from a bind tuple [type, value]
 */
export function extractBindTupleValue(tuple: [string, unknown]): FilterValue {
  const [type, value] = tuple

  switch (type) {
    case 'Text':
      return value as string
    case 'Real':
      return value as number
    case 'Boolean':
      return value as boolean
    case 'Date':
    case 'Date Time':
      return value instanceof Date ? value : new Date(value as string)
    case 'Null':
      return null
    case 'Duration':
      return value as string
    default:
      return value as FilterValue
  }
}

/**
 * Extracts values from an array of bind tuples
 * Used for 'in' operator where values are stored as [['Text', 'val1'], ['Text', 'val2'], ...]
 */
export function extractBindTupleValues(tuples: unknown): FilterValue[] {
  if (!Array.isArray(tuples)) {
    return []
  }

  // Check if this is an array of bind tuples
  if (tuples.length > 0 && isBindTuple(tuples[0])) {
    return tuples.map((tuple) => extractBindTupleValue(tuple as [string, unknown]))
  }

  // Already an array of values
  return tuples as FilterValue[]
}
