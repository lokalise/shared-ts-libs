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

/**
 * Encodes JSON object to base64url
 */
export const encodeCursor = (object: Record<string, unknown>): string => {
  const base64 = btoa(JSON.stringify(object))

  // Converting to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decodes base64url to JSON object
 */
export const decodeCursor = (value: string): Either<Error, Record<string, unknown>> => {
  let error: unknown
  try {
    // Converting base64url to base64
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')

    const result: unknown = JSON.parse(atob(paddedBase64))

    if (result && isObject(result)) {
      return { result }
    }
  } catch (e) {
    error = e
  }

  /* v8 ignore next */
  return { error: error instanceof Error ? error : new Error('Invalid cursor') }
}
