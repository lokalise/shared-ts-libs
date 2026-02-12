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

/** OData comparison operators */
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'

/** OData logical operators */
export type LogicalOperator = 'and' | 'or'

/** OData string functions supported by the transformer */
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

/** Comparison AST node: `[operator, left, right]` - e.g., `['eq', { name: 'id' }, { bind: 0 }]` */
export type ComparisonNode = [ComparisonOperator, FilterTreeNode, FilterTreeNode]

/** Logical AST node: `[operator, left, right]` - e.g., `['and', [...], [...]]` */
export type LogicalNode = [LogicalOperator, FilterTreeNode, FilterTreeNode]

/**
 * In AST node: `['in' | 'eqany', fieldRef, bindRefs]`.
 * The balena parser uses `'eqany'` instead of `'in'`, and may return a single bind ref for array values.
 */
export type InNode = ['in' | 'eqany', FieldReference, BindReference[] | BindReference]

/** Not AST node: `['not', expression]` */
export type NotNode = ['not', FilterTreeNode]

/** Function call AST node: `[functionName, arg1, arg2]` - e.g., `['contains', { name: 'field' }, { bind: 0 }]` */
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

/** A comparison filter (e.g., `status eq 'active'`, `price gt 100`) */
export interface ComparisonFilter {
  type: 'comparison'
  field: string
  operator: ComparisonOperator
  value: FilterValue
}

/** An `in` filter (e.g., `status in ('a', 'b', 'c')`) */
export interface InFilter {
  type: 'in'
  field: string
  values: FilterValue[]
}

/**
 * A `not in` filter. Not produced by the transformer (which yields `NotFilter` wrapping `InFilter`),
 * but supported by extraction utilities for manual construction.
 */
export interface NotInFilter {
  type: 'not-in'
  field: string
  values: FilterValue[]
}

/** A string function filter (e.g., `contains(name, 'test')`) */
export interface StringFunctionFilter {
  type: 'string-function'
  function: StringFunction
  field: string
  value: string
}

/** A logical filter combining sub-filters with `and` or `or` */
export interface LogicalFilter {
  type: 'logical'
  operator: LogicalOperator
  filters: TransformedFilter[]
}

/** A negation filter wrapping another filter (e.g., `not (status eq 'active')`) */
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
 * Utility type for representing the result of a field filter extraction.
 * Can be used by consumers to build typed extraction results.
 */
export interface FieldFilterResult<T = FilterValue> {
  found: boolean
  value?: T
  values?: T[]
  operator?: ComparisonOperator | 'in' | 'not-in'
}
