import { isBindReference, resolveBindReference } from './binds.ts'
import { ODataEvaluationError, UnsupportedConstructError } from './errors.ts'
import { evaluateFunction, isSupportedFunction } from './functions.ts'
import { resolveFieldValue } from './paths.ts'
import type {
  ArithmeticOperator,
  AstNode,
  CallNode,
  CallNodeTuple,
  EvalContext,
  EvalValue,
  FieldReference,
  LogicalOperator,
  TriBool,
} from './types.ts'
import {
  assertNoIntegerDivisionByZero,
  compareValues,
  isComparisonOperator,
  isNullish,
  toTriBool,
  triAnd,
  triNot,
  triOr,
} from './values.ts'

const LOGICAL_OPERATORS = new Set<string>(['and', 'or'])
const ARITHMETIC_OPERATORS = new Set<string>(['add', 'sub', 'mul', 'div', 'mod'])
const REJECTED_OPERATORS = new Set<string>(['in', 'eqany', 'has'])

const REJECTED_FUNCTIONS = new Set(['substringof'])

function isFieldReference(value: unknown): value is FieldReference {
  return typeof value === 'object' && value !== null && 'name' in value
}

function isCallNode(value: unknown): value is CallNodeTuple {
  return Array.isArray(value) && value.length === 2 && value[0] === 'call'
}

function isNotNode(value: unknown): value is ['not', AstNode] {
  return Array.isArray(value) && value.length === 2 && value[0] === 'not'
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recursive AST walk
export function assertSupportedTree(node: AstNode, filter: string): void {
  if (Array.isArray(node)) {
    const op = node[0]
    if (typeof op === 'string' && REJECTED_OPERATORS.has(op)) {
      throw new UnsupportedConstructError(
        `Unsupported OData construct: '${op}' is not supported in OData 4.0 strict mode`,
        filter,
      )
    }
    if (isCallNode(node)) {
      const method = node[1].method
      if (REJECTED_FUNCTIONS.has(method)) {
        throw new UnsupportedConstructError(
          `Unsupported OData function: '${method}' is deprecated; use contains() instead`,
          filter,
        )
      }
    }
    for (let i = 1; i < node.length; i++) {
      assertSupportedTree(node[i] as AstNode, filter)
    }
    return
  }

  if (isFieldReference(node)) {
    if (node.lambda) {
      assertSupportedTree(node.lambda.expression, filter)
    }
    if (node.method) {
      assertSupportedTree(node.method, filter)
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: expression dispatcher
export function evaluateExpression(ctx: EvalContext, node: AstNode): EvalValue {
  if (node === null) {
    return null
  }

  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return node
  }

  if (isBindReference(node)) {
    return resolveBindReference(ctx, node)
  }

  if (isFieldReference(node)) {
    return evaluateFieldNode(ctx, node)
  }

  if (isNotNode(node)) {
    return triNot(evaluatePredicate(ctx, node[1]))
  }

  if (isCallNode(node)) {
    return evaluateCallNode(ctx, node[1])
  }

  if (Array.isArray(node) && node.length >= 3) {
    const op = node[0] as string

    if (REJECTED_OPERATORS.has(op)) {
      throw new UnsupportedConstructError(`Unsupported operator: ${op}`, ctx.filter)
    }

    if (isComparisonOperator(op)) {
      const left = evaluateExpression(ctx, node[1] as AstNode)
      const right = evaluateExpression(ctx, node[2] as AstNode)
      return compareValues(op, left, right)
    }

    if (LOGICAL_OPERATORS.has(op)) {
      return evaluateLogical(ctx, op as LogicalOperator, node.slice(1) as AstNode[])
    }

    if (ARITHMETIC_OPERATORS.has(op)) {
      return evaluateArithmetic(
        ctx,
        op as ArithmeticOperator,
        node[1] as AstNode,
        node[2] as AstNode,
      )
    }
  }

  throw new ODataEvaluationError(`Unsupported expression node: ${JSON.stringify(node)}`, ctx.filter)
}

export function evaluatePredicate(ctx: EvalContext, node: AstNode): TriBool {
  const value = evaluateExpression(ctx, node)
  return toTriBool(value)
}

function evaluateLogical(
  ctx: EvalContext,
  operator: LogicalOperator,
  operands: AstNode[],
): TriBool {
  const [first, ...rest] = operands
  if (first === undefined) {
    return null
  }

  let result = evaluatePredicate(ctx, first)
  for (const operand of rest) {
    const next = evaluatePredicate(ctx, operand)
    result = operator === 'and' ? triAnd(result, next) : triOr(result, next)
  }
  return result
}

function evaluateArithmetic(
  ctx: EvalContext,
  operator: ArithmeticOperator,
  leftNode: AstNode,
  rightNode: AstNode,
): EvalValue {
  const left = evaluateExpression(ctx, leftNode)
  const right = evaluateExpression(ctx, rightNode)

  if (isNullish(left) || isNullish(right)) {
    return null
  }

  if (typeof left !== 'number' || typeof right !== 'number') {
    return null
  }

  if (operator === 'div' || operator === 'mod') {
    assertNoIntegerDivisionByZero(operator, left, right, ctx)
  }

  switch (operator) {
    case 'add':
      return left + right
    case 'sub':
      return left - right
    case 'mul':
      return left * right
    case 'div':
      return left / right
    case 'mod':
      return left % right
    default:
      return null
  }
}

function evaluateCallNode(ctx: EvalContext, call: CallNode): EvalValue {
  const { method, args } = call

  if (REJECTED_FUNCTIONS.has(method)) {
    throw new UnsupportedConstructError(`Unsupported function: ${method}`, ctx.filter)
  }

  if (!isSupportedFunction(method) && method !== 'any' && method !== 'all') {
    throw new UnsupportedConstructError(`Unsupported function: ${method}`, ctx.filter)
  }

  const evaluatedArgs = args.map((arg) => evaluateExpression(ctx, arg))

  if (method === 'substring' && evaluatedArgs.length >= 3) {
    const length = evaluatedArgs[2]
    if (typeof length === 'number' && length < 0) {
      throw new ODataEvaluationError('substring length must not be negative', ctx.filter)
    }
  }

  return evaluateFunction(method, evaluatedArgs)
}

function evaluateFieldNode(ctx: EvalContext, field: FieldReference): EvalValue {
  if (field.lambda) {
    return evaluateLambda(ctx, field)
  }

  if (field.method) {
    return evaluateCollectionMethod(ctx, field)
  }

  return resolveFieldValue(ctx, field)
}

function evaluateCollectionMethod(ctx: EvalContext, field: FieldReference): EvalValue {
  const collection = resolveFieldValue(ctx, { name: field.name })
  const call = field.method?.[1]
  if (!call) {
    return null
  }

  if (call.method === 'any' && call.args.length === 0) {
    if (!Array.isArray(collection)) {
      return collection === null ? null : false
    }
    return collection.length > 0
  }

  throw new UnsupportedConstructError(
    `Unsupported collection method on '${field.name}': ${call.method}`,
    ctx.filter,
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: collection lambda semantics
function evaluateLambda(ctx: EvalContext, field: FieldReference): EvalValue {
  const lambda = field.lambda
  if (!lambda) {
    return null
  }

  const collection = resolveFieldValue(ctx, { name: field.name })
  if (collection === null || collection === undefined) {
    return null
  }
  if (!Array.isArray(collection)) {
    return false
  }

  const { method, identifier, expression } = lambda
  const childCtx: EvalContext = { ...ctx, lambdaVar: identifier }

  if (method === 'any') {
    if (collection.length === 0) {
      return false
    }
    for (const item of collection) {
      childCtx.lambdaValue = item
      if (evaluatePredicate(childCtx, expression) === true) {
        return true
      }
    }
    return false
  }

  if (method === 'all') {
    if (collection.length === 0) {
      return true
    }
    for (const item of collection) {
      childCtx.lambdaValue = item
      const result = evaluatePredicate(childCtx, expression)
      if (result !== true) {
        return result === false ? false : null
      }
    }
    return true
  }

  throw new UnsupportedConstructError(`Unsupported lambda operator: ${method}`, ctx.filter)
}

export function matchesFilter(ctx: EvalContext, tree: AstNode): boolean {
  return evaluatePredicate(ctx, tree) === true
}
