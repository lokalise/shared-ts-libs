import type { ODataBinds } from '@balena/odata-parser'
import { transformFilter } from './filterTransformer.ts'
import type {
  ComparisonFilter,
  ComparisonOperator,
  FilterTreeNode,
  FilterValue,
  InFilter,
  StringFunctionFilter,
  TransformedFilter,
} from './types.ts'

/**
 * Flattens logical filters into a flat list of leaf filters.
 * Useful for extracting all conditions from a complex filter.
 */
export function flattenFilters(filter: TransformedFilter): TransformedFilter[] {
  if (filter.type === 'logical') {
    return filter.filters.flatMap(flattenFilters)
  }
  if (filter.type === 'not') {
    return flattenFilters(filter.filter)
  }
  return [filter]
}

/**
 * Collects all filters that match a specific field name
 */
export function getFiltersForField(
  filter: TransformedFilter,
  fieldName: string,
): TransformedFilter[] {
  const allFilters = flattenFilters(filter)
  return allFilters.filter((f) => {
    if (f.type === 'comparison' || f.type === 'string-function') {
      return f.field === fieldName
    }
    if (f.type === 'in' || f.type === 'not-in') {
      return f.field === fieldName
    }
    return false
  })
}

/**
 * Extracts a single equality value for a field.
 * Returns the first `eq` match, or undefined if no equality filter exists for the field.
 */
export function extractEqualityValue<T extends FilterValue = FilterValue>(
  filter: TransformedFilter,
  fieldName: string,
): T | undefined {
  const fieldFilters = getFiltersForField(filter, fieldName)
  const eqFilter = fieldFilters.find(
    (f): f is ComparisonFilter => f.type === 'comparison' && f.operator === 'eq',
  )
  return eqFilter?.value as T | undefined
}

/**
 * Extracts values from an 'in' filter for a field.
 * Returns undefined if field is not filtered by 'in'.
 */
export function extractInValues<T extends FilterValue = FilterValue>(
  filter: TransformedFilter,
  fieldName: string,
): T[] | undefined {
  const fieldFilters = getFiltersForField(filter, fieldName)
  const inFilter = fieldFilters.find((f): f is InFilter => f.type === 'in')
  return inFilter?.values as T[] | undefined
}

/**
 * Extracts either an equality value or 'in' values for a field.
 * Returns values as an array for uniform handling.
 */
export function extractFieldValues<T extends FilterValue = FilterValue>(
  filter: TransformedFilter,
  fieldName: string,
): T[] | undefined {
  const inValues = extractInValues<T>(filter, fieldName)
  if (inValues) {
    return inValues
  }

  const eqValue = extractEqualityValue<T>(filter, fieldName)
  if (eqValue !== undefined) {
    return [eqValue]
  }

  return undefined
}

/**
 * Extracts a comparison filter for a field with a specific operator.
 */
export function extractComparison(
  filter: TransformedFilter,
  fieldName: string,
  operator: ComparisonOperator,
): ComparisonFilter | undefined {
  const fieldFilters = getFiltersForField(filter, fieldName)
  return fieldFilters.find(
    (f): f is ComparisonFilter => f.type === 'comparison' && f.operator === operator,
  )
}

/**
 * Extracts range filters (gt, ge, lt, le) for a field.
 * Returns an object with min/max bounds if present.
 */
export function extractRange(
  filter: TransformedFilter,
  fieldName: string,
):
  | { min?: FilterValue; minInclusive?: boolean; max?: FilterValue; maxInclusive?: boolean }
  | undefined {
  const fieldFilters = getFiltersForField(filter, fieldName)
  const rangeFilters = fieldFilters.filter(
    (f): f is ComparisonFilter =>
      f.type === 'comparison' && ['gt', 'ge', 'lt', 'le'].includes(f.operator),
  )

  if (rangeFilters.length === 0) {
    return undefined
  }

  const result: {
    min?: FilterValue
    minInclusive?: boolean
    max?: FilterValue
    maxInclusive?: boolean
  } = {}

  for (const rf of rangeFilters) {
    if (rf.operator === 'gt' || rf.operator === 'ge') {
      result.min = rf.value
      result.minInclusive = rf.operator === 'ge'
    } else if (rf.operator === 'lt' || rf.operator === 'le') {
      result.max = rf.value
      result.maxInclusive = rf.operator === 'le'
    }
  }

  return result
}

/**
 * Extracts a string function filter for a field.
 */
export function extractStringFunction(
  filter: TransformedFilter,
  fieldName: string,
  functionName?: string,
): StringFunctionFilter | undefined {
  const fieldFilters = getFiltersForField(filter, fieldName)
  return fieldFilters.find(
    (f): f is StringFunctionFilter =>
      f.type === 'string-function' && (functionName === undefined || f.function === functionName),
  )
}

/**
 * Checks if a field has any filter applied.
 */
export function hasFieldFilter(filter: TransformedFilter, fieldName: string): boolean {
  return getFiltersForField(filter, fieldName).length > 0
}

/**
 * Gets all field names that have filters applied.
 */
export function getFilteredFieldNames(filter: TransformedFilter): string[] {
  const allFilters = flattenFilters(filter)
  const fieldNames = new Set<string>()

  for (const f of allFilters) {
    if (
      f.type === 'comparison' ||
      f.type === 'string-function' ||
      f.type === 'in' ||
      f.type === 'not-in'
    ) {
      fieldNames.add(f.field)
    }
  }

  return Array.from(fieldNames)
}

/**
 * Collects all filters connected by AND at the top level.
 * Useful for processing filters where all conditions must be met.
 */
export function collectAndFilters(filter: TransformedFilter): TransformedFilter[] {
  if (filter.type === 'logical' && filter.operator === 'and') {
    return filter.filters.flatMap(collectAndFilters)
  }
  return [filter]
}

/**
 * Collects all filters connected by OR at the top level.
 * Useful for processing filters where any condition can be met.
 */
export function collectOrFilters(filter: TransformedFilter): TransformedFilter[] {
  if (filter.type === 'logical' && filter.operator === 'or') {
    return filter.filters.flatMap(collectOrFilters)
  }
  return [filter]
}

/**
 * Creates a filter map from transformed filters for easy field access.
 * Returns a Map of field name to filter(s) for that field.
 */
export function createFilterMap(filter: TransformedFilter): Map<string, TransformedFilter[]> {
  const allFilters = flattenFilters(filter)
  const filterMap = new Map<string, TransformedFilter[]>()

  for (const f of allFilters) {
    let fieldName: string | undefined

    if (
      f.type === 'comparison' ||
      f.type === 'string-function' ||
      f.type === 'in' ||
      f.type === 'not-in'
    ) {
      fieldName = f.field
    }

    if (fieldName) {
      const existing = filterMap.get(fieldName) || []
      existing.push(f)
      filterMap.set(fieldName, existing)
    }
  }

  return filterMap
}

/**
 * High-level convenience function that transforms and extracts filter values in one call.
 * Takes raw balena parser output and returns a simple field-to-values map.
 */
export function extractAllFieldValues(
  tree: FilterTreeNode,
  binds: ODataBinds,
): Map<string, FilterValue[]> {
  const transformed = transformFilter(tree, binds)
  const filterMap = createFilterMap(transformed)
  const result = new Map<string, FilterValue[]>()

  for (const [field, filters] of filterMap) {
    const values: FilterValue[] = []

    for (const f of filters) {
      if (f.type === 'comparison') {
        values.push(f.value)
      } else if (f.type === 'in' || f.type === 'not-in') {
        values.push(...f.values)
      } else if (f.type === 'string-function') {
        values.push(f.value)
      }
    }

    if (values.length > 0) {
      result.set(field, values)
    }
  }

  return result
}
