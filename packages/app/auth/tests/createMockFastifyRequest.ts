import type { FastifyRequest } from 'fastify'
import { createRequestContext } from './createRequestContext.ts'

export const createMockFastifyRequest = (token?: string, header?: string): FastifyRequest =>
  ({
    headers: { ...(token ? { [header ? header : 'authorization']: token } : {}) },
    reqContext: createRequestContext(),
  }) as unknown as FastifyRequest
