import type { ODataBinds } from '@balena/odata-parser'

export interface FilterOptions {
  /** Parameter alias values referenced as @name in the filter expression */
  binds?: Record<string, unknown>
  /** Maximum number of matching items to return */
  limit?: number
}

export interface FilterResult {
  items: Record<string, unknown>[]
  truncated: boolean
}

export interface FieldReference {
  name: string
  property?: FieldReference
  count?: boolean
  method?: ['call', CallNode]
  lambda?: LambdaNode
}

export interface LambdaNode {
  method: 'any' | 'all'
  identifier: string
  expression: AstNode
}

export interface CallNode {
  method: string
  args: AstNode[]
}

export interface BindReference {
  bind: number | string
}

export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'
export type LogicalOperator = 'and' | 'or'
export type ArithmeticOperator = 'add' | 'sub' | 'mul' | 'div' | 'mod'

export type AstNode =
  | ComparisonNode
  | LogicalNode
  | NotNode
  | CallNodeTuple
  | FieldReference
  | BindReference
  | null
  | number
  | boolean
  | string

export type ComparisonNode = [ComparisonOperator, AstNode, AstNode]
export type LogicalNode = [LogicalOperator, ...AstNode[]]
export type NotNode = ['not', AstNode]
export type CallNodeTuple = ['call', CallNode]

export interface ParsedFilter {
  tree: AstNode
  binds: ODataBinds
}

export type TriBool = boolean | null

export type EvalValue = string | number | boolean | Date | null | unknown

export interface EvalContext {
  root: Record<string, unknown>
  parserBinds: ODataBinds
  aliasBinds: Record<string, unknown>
  filter: string
  lambdaVar?: string
  lambdaValue?: unknown
}
