import { ODataEvaluationError } from './errors.ts'
import type { ComparisonOperator, EvalContext, EvalValue, TriBool } from './types.ts'

const COMPARISON_OPERATORS = new Set<string>(['eq', 'ne', 'gt', 'ge', 'lt', 'le'])

export function isComparisonOperator(op: string): op is ComparisonOperator {
  return COMPARISON_OPERATORS.has(op)
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

export function toTriBool(value: EvalValue): TriBool {
  if (value === true || value === false) {
    return value
  }
  return null
}

export function triNot(value: TriBool): TriBool {
  if (value === null) {
    return null
  }
  return !value
}

export function triAnd(left: TriBool, right: TriBool): TriBool {
  if (left === false) {
    return false
  }
  if (left === true) {
    return right
  }
  if (right === false) {
    return false
  }
  return null
}

export function triOr(left: TriBool, right: TriBool): TriBool {
  if (left === true) {
    return true
  }
  if (left === false) {
    return right
  }
  if (right === true) {
    return true
  }
  return null
}

function normalizeComparable(value: EvalValue): EvalValue {
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'string') {
    const date = Date.parse(value)
    if (!Number.isNaN(date) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Date(date)
    }
  }
  return value
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-type ordering
function compareOrder(left: EvalValue, right: EvalValue): number | null {
  const a = normalizeComparable(left)
  const b = normalizeComparable(right)

  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0
  }

  if (a instanceof Date && b instanceof Date) {
    const diff = a.getTime() - b.getTime()
    return diff < 0 ? -1 : diff > 0 ? 1 : 0
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b)
  }

  return null
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OData comparison null rules
export function compareValues(
  operator: ComparisonOperator,
  left: EvalValue,
  right: EvalValue,
): TriBool {
  const leftNull = isNullish(left)
  const rightNull = isNullish(right)

  switch (operator) {
    case 'eq': {
      if (leftNull && rightNull) {
        return true
      }
      if (leftNull || rightNull) {
        return false
      }
      const a = normalizeComparable(left)
      const b = normalizeComparable(right)
      if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime()
      }
      return a === b
    }
    case 'ne': {
      if (leftNull && rightNull) {
        return false
      }
      if (leftNull || rightNull) {
        return true
      }
      const a = normalizeComparable(left)
      const b = normalizeComparable(right)
      if (a instanceof Date && b instanceof Date) {
        return a.getTime() !== b.getTime()
      }
      return a !== b
    }
    case 'gt':
    case 'lt':
      if (leftNull || rightNull) {
        return false
      }
      break
    case 'ge':
    case 'le':
      if (leftNull && rightNull) {
        return true
      }
      if (leftNull || rightNull) {
        return false
      }
      break
  }

  const order = compareOrder(left, right)
  if (order === null) {
    return false
  }

  switch (operator) {
    case 'gt':
      return order > 0
    case 'ge':
      return order >= 0
    case 'lt':
      return order < 0
    case 'le':
      return order <= 0
    default:
      return false
  }
}

export function assertNoIntegerDivisionByZero(
  operator: 'div' | 'mod',
  left: EvalValue,
  right: EvalValue,
  ctx: EvalContext,
): void {
  if (
    (operator === 'div' || operator === 'mod') &&
    typeof left === 'number' &&
    Number.isInteger(left) &&
    typeof right === 'number' &&
    Number.isInteger(right) &&
    right === 0
  ) {
    throw new ODataEvaluationError('Division by zero in integer arithmetic', ctx.filter)
  }
}
