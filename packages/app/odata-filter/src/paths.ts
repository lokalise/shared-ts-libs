import type { EvalContext, FieldReference } from './types.ts'

function readProperty(value: unknown, name: string): unknown {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'object') {
    return null
  }
  return (value as Record<string, unknown>)[name] ?? null
}

export function getFieldPath(field: FieldReference, separator = '/'): string {
  if (field.property) {
    return `${field.name}${separator}${getFieldPath(field.property, separator)}`
  }
  return field.name
}

export function resolveFieldValue(ctx: EvalContext, field: FieldReference): unknown {
  let current: unknown

  if (ctx.lambdaVar !== undefined && field.name === ctx.lambdaVar) {
    current = ctx.lambdaValue
  } else {
    current = readProperty(ctx.root, field.name)
  }

  let segment: FieldReference | undefined = field.property
  while (segment) {
    current = readProperty(current, segment.name)
    segment = segment.property
  }

  if (field.count) {
    if (current === null || current === undefined) {
      return null
    }
    if (!Array.isArray(current)) {
      return null
    }
    return current.length
  }

  return current ?? null
}
