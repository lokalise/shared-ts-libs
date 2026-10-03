import type { EvalValue } from './types.ts'
import { isNullish } from './values.ts'

function requireString(value: EvalValue): string | null {
  if (isNullish(value) || typeof value !== 'string') {
    return null
  }
  return value
}

function requireNumber(value: EvalValue): number | null {
  if (isNullish(value)) {
    return null
  }
  if (typeof value !== 'number') {
    return null
  }
  return value
}

function toDate(value: EvalValue): Date | null {
  if (isNullish(value)) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) {
      return null
    }
    return new Date(parsed)
  }
  return null
}

const STRING_FUNCTIONS = new Set([
  'concat',
  'contains',
  'endswith',
  'indexof',
  'length',
  'startswith',
  'substring',
  'tolower',
  'toupper',
  'trim',
])

const DATE_FUNCTIONS = new Set([
  'date',
  'day',
  'fractionalseconds',
  'hour',
  'maxdatetime',
  'mindatetime',
  'minute',
  'month',
  'now',
  'second',
  'time',
  'totaloffsetminutes',
  'totalseconds',
  'year',
])

const MATH_FUNCTIONS = new Set(['ceiling', 'floor', 'round'])

export function isSupportedFunction(method: string): boolean {
  return STRING_FUNCTIONS.has(method) || DATE_FUNCTIONS.has(method) || MATH_FUNCTIONS.has(method)
}

export function evaluateFunction(method: string, args: EvalValue[]): EvalValue {
  if (STRING_FUNCTIONS.has(method)) {
    return evaluateStringFunction(method, args)
  }
  if (DATE_FUNCTIONS.has(method)) {
    return evaluateDateFunction(method, args)
  }
  if (MATH_FUNCTIONS.has(method)) {
    return evaluateMathFunction(method, args)
  }
  return null
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OData string function switch
function evaluateStringFunction(method: string, args: EvalValue[]): EvalValue {
  switch (method) {
    case 'concat': {
      const left = requireString(args[0])
      const right = requireString(args[1])
      if (left === null || right === null) {
        return null
      }
      return left + right
    }
    case 'contains': {
      const haystack = requireString(args[0])
      const needle = requireString(args[1])
      if (haystack === null || needle === null) {
        return null
      }
      return haystack.includes(needle)
    }
    case 'endswith': {
      const value = requireString(args[0])
      const suffix = requireString(args[1])
      if (value === null || suffix === null) {
        return null
      }
      return value.endsWith(suffix)
    }
    case 'startswith': {
      const value = requireString(args[0])
      const prefix = requireString(args[1])
      if (value === null || prefix === null) {
        return null
      }
      return value.startsWith(prefix)
    }
    case 'indexof': {
      const value = requireString(args[0])
      const search = requireString(args[1])
      if (value === null || search === null) {
        return null
      }
      return value.indexOf(search)
    }
    case 'length': {
      const value = requireString(args[0])
      if (value === null) {
        return null
      }
      return [...value].length
    }
    case 'substring': {
      const value = requireString(args[0])
      const start = requireNumber(args[1])
      if (value === null || start === null) {
        return null
      }
      if (args.length >= 3) {
        const length = requireNumber(args[2])
        if (length === null) {
          return null
        }
        if (length < 0) {
          return null
        }
        return value.substring(start, start + length)
      }
      return value.substring(start)
    }
    case 'tolower': {
      const value = requireString(args[0])
      return value === null ? null : value.toLocaleLowerCase()
    }
    case 'toupper': {
      const value = requireString(args[0])
      return value === null ? null : value.toLocaleUpperCase()
    }
    case 'trim': {
      const value = requireString(args[0])
      return value === null ? null : value.trim()
    }
    default:
      return null
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OData date function switch
function evaluateDateFunction(method: string, args: EvalValue[]): EvalValue {
  switch (method) {
    case 'now':
      return new Date()
    case 'maxdatetime':
      return new Date(9999, 11, 31, 23, 59, 59, 999)
    case 'mindatetime':
      return new Date(0)
    case 'year': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCFullYear()
    }
    case 'month': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCMonth() + 1
    }
    case 'day': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCDate()
    }
    case 'hour': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCHours()
    }
    case 'minute': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCMinutes()
    }
    case 'second': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCSeconds()
    }
    case 'fractionalseconds': {
      const date = toDate(args[0])
      return date === null ? null : date.getUTCMilliseconds() / 1000
    }
    case 'date': {
      const date = toDate(args[0])
      if (date === null) {
        return null
      }
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    }
    case 'time': {
      const date = toDate(args[0])
      if (date === null) {
        return null
      }
      return {
        hours: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        seconds: date.getUTCSeconds(),
        fractionalSeconds: date.getUTCMilliseconds() / 1000,
      }
    }
    case 'totaloffsetminutes': {
      const date = toDate(args[0])
      return date === null ? null : 0
    }
    case 'totalseconds':
      return typeof args[0] === 'number' ? args[0] : null
    default:
      return null
  }
}

function evaluateMathFunction(method: string, args: EvalValue[]): EvalValue {
  const value = requireNumber(args[0])
  if (value === null) {
    return null
  }
  switch (method) {
    case 'ceiling':
      return Math.ceil(value)
    case 'floor':
      return Math.floor(value)
    case 'round':
      return Math.round(value)
    default:
      return null
  }
}
