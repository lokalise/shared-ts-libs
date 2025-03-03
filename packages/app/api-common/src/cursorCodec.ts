import { isObject } from './typeUtils'

type Left<T> = {
  error: T
  result?: never
}

type Right<U> = {
  error?: never
  result: U
}

export type Either<T, U> = NonNullable<Left<T> | Right<U>>

export type ConversionMode = 'buffer' | 'atob-btoa'
const resolveConversionMode = (): ConversionMode =>
  typeof Buffer !== 'undefined' ? 'buffer' : 'atob-btoa'

export const base64urlToString = (base64url: string, mode: ConversionMode = 'buffer'): string => {
  if (mode === 'buffer') {
    return Buffer.from(base64url, 'base64url').toString('utf-8')
  }

  // Convert base64url to base64
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  // Decode base64
  return atob(paddedBase64)
}

export const stringToBase64url = (value: string, mode: ConversionMode = 'buffer'): string => {
  if (mode === 'buffer') {
    return Buffer.from(value).toString('base64url')
  }

  // Encode
  const base64 = btoa(value)
  // Convert to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Encodes JSON object to base64url
 * Compatible with both browser and node envs
 */
export const encodeCursor = (object: Record<string, unknown>): string => {
  return stringToBase64url(JSON.stringify(object), resolveConversionMode())
}

/**
 * Decodes base64url to JSON object
 * Compatible with both browser and node envs
 */
export const decodeCursor = (value: string): Either<Error, Record<string, unknown>> => {
  let error: unknown
  try {
    const result: unknown = JSON.parse(base64urlToString(value, resolveConversionMode()))

    if (result && isObject(result)) {
      return { result }
    }
  } catch (e) {
    error = e
  }

  /* v8 ignore next */
  return { error: error instanceof Error ? error : new Error('Invalid cursor') }
}
