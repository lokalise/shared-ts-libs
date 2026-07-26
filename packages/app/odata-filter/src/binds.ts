import type { BindReference, EvalContext, EvalValue } from './types.ts'

function isBindTuple(value: unknown): value is [string, unknown] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string'
}

function bindTupleToValue(tuple: [string, unknown]): EvalValue {
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
      return value as EvalValue
  }
}

export function isBindReference(value: unknown): value is BindReference {
  if (typeof value !== 'object' || value === null || !('bind' in value)) {
    return false
  }
  const key = (value as BindReference).bind
  return typeof key === 'number' || (typeof key === 'string' && key.startsWith('@'))
}

export function resolveBindReference(ctx: EvalContext, ref: BindReference): EvalValue {
  const key = ref.bind

  if (typeof key === 'string') {
    if (Object.hasOwn(ctx.aliasBinds, key.slice(1))) {
      return ctx.aliasBinds[key.slice(1)] as EvalValue
    }
    return null
  }

  const bind = ctx.parserBinds[key]
  if (!bind) {
    return null
  }

  if (isBindTuple(bind)) {
    return bindTupleToValue(bind)
  }

  return bind as EvalValue
}
