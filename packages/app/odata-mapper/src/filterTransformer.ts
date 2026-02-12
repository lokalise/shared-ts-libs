import type { BindReference, ODataBinds } from '@balena/odata-parser'
import {
  extractBindTupleValues,
  isBindReference,
  resolveBind,
  resolveBinds,
} from './bindResolver.ts'
import type {
  ComparisonFilter,
  ComparisonOperator,
  FieldReference,
  FilterTreeNode,
  FilterValue,
  InFilter,
  LogicalFilter,
  LogicalOperator,
  NotFilter,
  StringFunction,
  StringFunctionFilter,
  TransformedFilter,
  TransformOptions,
} from './types.ts'

const COMPARISON_OPERATORS = new Set<string>(['eq', 'ne', 'gt', 'ge', 'lt', 'le'])
const LOGICAL_OPERATORS = new Set<string>(['and', 'or'])
const STRING_FUNCTIONS = new Set<string>([
  'contains',
  'startswith',
  'endswith',
  'substringof',
  'tolower',
  'toupper',
])

/**
 * Checks if a value is a field reference
 */
export function isFieldReference(value: unknown): value is FieldReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as FieldReference).name === 'string'
  )
}

/**
 * Gets the full field path for nested properties (e.g., "address/city" -> "address.city")
 */
export function getFieldPath(field: FieldReference, separator = '/'): string {
  if (field.property) {
    return `${field.name}${separator}${getFieldPath(field.property, separator)}`
  }
  return field.name
}

/**
 * Checks if a node is a comparison operation
 */
function isComparisonNode(
  node: FilterTreeNode,
): node is [ComparisonOperator, FilterTreeNode, FilterTreeNode] {
  return Array.isArray(node) && node.length === 3 && COMPARISON_OPERATORS.has(node[0] as string)
}

/**
 * Checks if a node is a logical operation (and/or) - can have 2+ operands
 */
function isLogicalNode(node: unknown): node is [LogicalOperator, ...FilterTreeNode[]] {
  return Array.isArray(node) && node.length >= 3 && LOGICAL_OPERATORS.has(node[0] as string)
}

/**
 * Checks if a node is an 'in' operation (balena uses 'eqany' for 'in')
 */
function isInNode(node: FilterTreeNode): node is ['in' | 'eqany', FieldReference, BindReference] {
  return (
    Array.isArray(node) &&
    node.length === 3 &&
    (node[0] === 'in' || node[0] === 'eqany') &&
    isFieldReference(node[1])
  )
}

/**
 * Checks if a node is a 'not' operation
 */
function isNotNode(node: FilterTreeNode): node is ['not', FilterTreeNode] {
  return Array.isArray(node) && node.length === 2 && node[0] === 'not'
}

/**
 * Checks if a node is a string function call (direct style)
 */
function isStringFunctionNode(
  node: FilterTreeNode,
): node is [StringFunction, FilterTreeNode, FilterTreeNode] {
  return Array.isArray(node) && node.length === 3 && STRING_FUNCTIONS.has(node[0] as string)
}

/**
 * Checks if a node is a function call (balena 'call' style)
 */
interface CallNode {
  method: string
  args: unknown[]
}

function isCallNode(node: unknown): node is ['call', CallNode] {
  return (
    Array.isArray(node) &&
    node.length === 2 &&
    node[0] === 'call' &&
    typeof node[1] === 'object' &&
    node[1] !== null &&
    'method' in node[1] &&
    'args' in node[1]
  )
}

/**
 * Checks if a value is a literal null
 */
function isNullLiteral(value: unknown): value is null {
  return value === null
}

/**
 * Resolves a value that could be a bind reference, field reference, or literal.
 * Used for comparison operators which expect single values, not arrays.
 */
function resolveValue(value: unknown, binds: ODataBinds): FilterValue | string {
  if (isBindReference(value)) {
    const resolved = resolveBind(binds, value)
    // resolveBind can return arrays for 'in' operator, but resolveValue is only
    // used for comparison operators which expect single values
    if (Array.isArray(resolved)) {
      throw new Error(`Unexpected array value in comparison: ${JSON.stringify(resolved)}`)
    }
    return resolved
  }
  if (isFieldReference(value)) {
    return getFieldPath(value)
  }
  if (isNullLiteral(value)) {
    return null
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  throw new Error(`Cannot resolve value: ${JSON.stringify(value)}`)
}

/**
 * Transforms a comparison node to a ComparisonFilter
 */
function transformComparison(
  node: [ComparisonOperator, FilterTreeNode, FilterTreeNode],
  binds: ODataBinds,
): ComparisonFilter {
  const [operator, left, right] = node

  // Determine which side is the field and which is the value
  let field: string
  let value: FilterValue

  if (isFieldReference(left)) {
    field = getFieldPath(left)
    value = resolveValue(right, binds)
  } else if (isFieldReference(right)) {
    field = getFieldPath(right)
    value = resolveValue(left, binds)
  } else {
    throw new Error(`Unsupported comparison operands: ${JSON.stringify(node)}`)
  }

  return {
    type: 'comparison',
    field,
    operator,
    value,
  }
}

/**
 * Transforms an 'in' or 'eqany' node to an InFilter
 */
function transformIn(
  node: ['in' | 'eqany', FieldReference, BindReference | BindReference[]],
  binds: ODataBinds,
): InFilter {
  const [, fieldRef, valueRef] = node

  // balena parser can return either a single bind ref or array of bind refs
  let values: FilterValue[]
  if (Array.isArray(valueRef) && !isBindReference(valueRef)) {
    values = resolveBinds(binds, valueRef as BindReference[])
  } else if (isBindReference(valueRef)) {
    // Single bind reference - resolve it
    // The resolved value may be an array of bind tuples [['Text', 'val1'], ['Text', 'val2'], ...]
    const resolved = resolveBind(binds, valueRef)
    if (Array.isArray(resolved)) {
      // Extract values from bind tuples if needed
      values = extractBindTupleValues(resolved)
    } else {
      values = [resolved]
    }
  } else {
    throw new Error(`Unsupported in operand: ${JSON.stringify(node)}`)
  }

  return {
    type: 'in',
    field: getFieldPath(fieldRef),
    values,
  }
}

/**
 * Transforms a string function node to a StringFunctionFilter (direct style)
 */
function transformStringFunction(
  node: [StringFunction, FilterTreeNode, FilterTreeNode],
  binds: ODataBinds,
): StringFunctionFilter {
  const [func, first, second] = node

  let field: string
  let value: string

  // Handle both orderings: contains(field, 'value') and substringof('value', field)
  if (func === 'substringof') {
    // substringof has reversed argument order: substringof('value', field)
    if (isBindReference(first) && isFieldReference(second)) {
      value = String(resolveBind(binds, first))
      field = getFieldPath(second)
    } else if (isFieldReference(first) && isBindReference(second)) {
      field = getFieldPath(first)
      value = String(resolveBind(binds, second))
    } else {
      throw new Error(`Unsupported substringof operands: ${JSON.stringify(node)}`)
    }
  } else {
    // contains, startswith, endswith: function(field, 'value')
    if (isFieldReference(first) && isBindReference(second)) {
      field = getFieldPath(first)
      value = String(resolveBind(binds, second))
    } else if (isBindReference(first) && isFieldReference(second)) {
      value = String(resolveBind(binds, first))
      field = getFieldPath(second)
    } else {
      throw new Error(`Unsupported ${func} operands: ${JSON.stringify(node)}`)
    }
  }

  return {
    type: 'string-function',
    function: func,
    field,
    value,
  }
}

/**
 * Transforms a 'call' style function node to a StringFunctionFilter
 */
function transformCallFunction(node: ['call', CallNode], binds: ODataBinds): StringFunctionFilter {
  const { method, args } = node[1]

  if (!STRING_FUNCTIONS.has(method)) {
    throw new Error(`Unsupported function: ${method}`)
  }

  const func = method as StringFunction
  const [first, second] = args

  let field: string
  let value: string

  if (func === 'substringof') {
    if (isBindReference(first) && isFieldReference(second)) {
      value = String(resolveBind(binds, first))
      field = getFieldPath(second)
    } else if (isFieldReference(first) && isBindReference(second)) {
      field = getFieldPath(first)
      value = String(resolveBind(binds, second))
    } else {
      throw new Error(`Unsupported substringof operands: ${JSON.stringify(node)}`)
    }
  } else {
    if (isFieldReference(first) && isBindReference(second)) {
      field = getFieldPath(first)
      value = String(resolveBind(binds, second))
    } else if (isBindReference(first) && isFieldReference(second)) {
      value = String(resolveBind(binds, first))
      field = getFieldPath(second)
    } else {
      throw new Error(`Unsupported ${func} operands: ${JSON.stringify(node)}`)
    }
  }

  return {
    type: 'string-function',
    function: func,
    field,
    value,
  }
}

/**
 * Transforms a logical node (and/or) to a LogicalFilter
 * Handles both binary (3 elements) and n-ary (>3 elements) forms
 */
function transformLogical(
  node: [LogicalOperator, ...unknown[]],
  binds: ODataBinds,
  options: TransformOptions,
): LogicalFilter {
  const [operator, ...operands] = node

  return {
    type: 'logical',
    operator,
    filters: operands.map((operand) =>
      transformFilterNode(operand as FilterTreeNode, binds, options),
    ),
  }
}

/**
 * Transforms a 'not' node to a NotFilter
 */
function transformNot(
  node: ['not', FilterTreeNode],
  binds: ODataBinds,
  options: TransformOptions,
): NotFilter {
  const [, inner] = node

  return {
    type: 'not',
    filter: transformFilterNode(inner, binds, options),
  }
}

/**
 * Transforms a filter tree node into a high-level TransformedFilter
 */
export function transformFilterNode(
  node: FilterTreeNode,
  binds: ODataBinds,
  options: TransformOptions = {},
): TransformedFilter {
  if (isComparisonNode(node)) {
    return transformComparison(node, binds)
  }

  if (isInNode(node)) {
    return transformIn(node, binds)
  }

  if (isStringFunctionNode(node)) {
    return transformStringFunction(node, binds)
  }

  if (isCallNode(node)) {
    return transformCallFunction(node, binds)
  }

  if (isLogicalNode(node)) {
    return transformLogical(node, binds, options)
  }

  if (isNotNode(node)) {
    return transformNot(node, binds, options)
  }

  throw new Error(`Unsupported filter node: ${JSON.stringify(node)}`)
}

/**
 * Main transformation function that converts the balena parser output
 * to a high-level filter structure
 */
export function transformFilter(
  tree: FilterTreeNode,
  binds: ODataBinds,
  options: TransformOptions = {},
): TransformedFilter {
  return transformFilterNode(tree, binds, options)
}
