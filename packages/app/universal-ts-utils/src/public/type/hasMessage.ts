import { isObject } from './isObject.js'

export const hasMessage = (maybe: unknown): maybe is { message: string } =>
  isObject(maybe) && typeof maybe.message === 'string'
