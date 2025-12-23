/**
 * Re-export types from @balena/odata-parser
 */
export type {
  BindKey,
  BindReference,
  BooleanBind,
  DateBind,
  FilterOption,
  NumberBind,
  ODataBinds,
  ODataOptions,
  ODataQuery,
  PropertyPath,
  TextBind,
} from '@balena/odata-parser'

import type { BindReference, FilterOption, ODataBinds } from '@balena/odata-parser'

/**
 * Field reference in filter expressions - { name: 'fieldName' }
 */
export interface FieldReference {
  name: string
  property?: FieldReference
}

// Comparison operators
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'

// Logical operators
export type LogicalOperator = 'and' | 'or'

// String functions
export type StringFunction =
  | 'contains'
  | 'startswith'
  | 'endswith'
  | 'substringof'
  | 'tolower'
  | 'toupper'

/**
 * Filter tree node types - the actual structure balena parser produces
 * FilterOption from balena is typed as `any`, so we provide more specific types
 */
export type FilterTreeNode =
  | ComparisonNode
  | LogicalNode
  | InNode
  | NotNode
  | FunctionCallNode
  | FieldReference
  | BindReference

// [operator, left, right] - e.g., ['eq', { name: 'id' }, { bind: 0 }]
export type ComparisonNode = [ComparisonOperator, FilterTreeNode, FilterTreeNode]

// [operator, left, right] - e.g., ['and', [...], [...]]
export type LogicalNode = [LogicalOperator, FilterTreeNode, FilterTreeNode]

// ['in' | 'eqany', { name: 'field' }, [{ bind: 0 }, { bind: 1 }, ...] | { bind: 0 }]
// balena parser uses 'eqany' instead of 'in', and may return single bind ref for array values
export type InNode = ['in' | 'eqany', FieldReference, BindReference[] | BindReference]

// ['not', expression]
export type NotNode = ['not', FilterTreeNode]

// Function calls like ['contains', { name: 'field' }, { bind: 0 }]
export type FunctionCallNode = [StringFunction, FilterTreeNode, FilterTreeNode]

/**
 * Wrapper type for parsed filter result from balena parser
 */
export interface ParsedFilter {
  tree: FilterOption
  binds: ODataBinds
}

/**
 * High-level transformed filter types for service consumption
 */

/** Primitive filter value types */
export type FilterValue = string | number | boolean | Date | null

/**
 * Raw bind value that resolveBind can return.
 * For 'in' operator, balena parser stores values as an array of bind tuples
 * like [['Text', 'val1'], ['Text', 'val2'], ...] which gets returned as-is
 * from the default case in resolveBind.
 */
export type RawBindValue = FilterValue | unknown[]

export interface ComparisonFilter {
  type: 'comparison'
  field: string
  operator: ComparisonOperator
  value: FilterValue
}

export interface InFilter {
  type: 'in'
  field: string
  values: FilterValue[]
}

export interface NotInFilter {
  type: 'not-in'
  field: string
  values: FilterValue[]
}

export interface StringFunctionFilter {
  type: 'string-function'
  function: StringFunction
  field: string
  value: string
}

export interface LogicalFilter {
  type: 'logical'
  operator: LogicalOperator
  filters: TransformedFilter[]
}

export interface NotFilter {
  type: 'not'
  filter: TransformedFilter
}

export type TransformedFilter =
  | ComparisonFilter
  | InFilter
  | NotInFilter
  | StringFunctionFilter
  | LogicalFilter
  | NotFilter

/**
 * Options for filter transformation
 */
export interface TransformOptions {
  /** If true, throws on unsupported operations. Default: false */
  strict?: boolean
}

/**
 * Result of extracting a specific field filter
 */
export interface FieldFilterResult<T = FilterValue> {
  found: boolean
  value?: T
  values?: T[]
  operator?: ComparisonOperator | 'in' | 'not-in'
}
