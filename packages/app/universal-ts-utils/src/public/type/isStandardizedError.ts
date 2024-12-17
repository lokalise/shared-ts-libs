import { isObject } from './isObject.js'

// Error structure commonly used in libraries, e. g. fastify
export type StandardizedError = {
  code: string
  message: string
}

export const isStandardizedError = (error: unknown): error is StandardizedError =>
  isObject(error) && typeof error.code === 'string' && typeof error.message === 'string'
