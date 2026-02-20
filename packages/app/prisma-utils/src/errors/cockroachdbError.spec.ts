import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'
import { isCockroachDBRetryTransaction } from './cockroachdbError.ts'
import { PRISMA_SERIALIZATION_ERROR } from './prismaError.ts'

describe('cockroachdbError', () => {
  it('should return false without meta', () => {
    // Given
    const error = new PrismaClientKnownRequestError('test', {
      code: PRISMA_SERIALIZATION_ERROR,
      clientVersion: '1',
    })

    // When - Then
    expect(isCockroachDBRetryTransaction(error)).toBe(false)
  })

  it('should return false for a wrong meta field', () => {
    // Given
    const error = new PrismaClientKnownRequestError('test', {
      code: 'P100',
      clientVersion: '1',
      meta: { wrong: 'meta' },
    })

    // When - Then
    expect(isCockroachDBRetryTransaction(error)).toBe(false)
  })

  it('should return false for wrong meta.code', () => {
    // Given
    const error = new PrismaClientKnownRequestError('test', {
      code: 'P100',
      clientVersion: '1',
      meta: { code: '40002' },
    })

    // When - Then
    expect(isCockroachDBRetryTransaction(error)).toBe(false)
  })

  it('should return try for a CRDB retry transaction error', () => {
    // Given
    const error = new PrismaClientKnownRequestError('test', {
      code: 'P100',
      clientVersion: '1',
      meta: { code: '40001' },
    })

    // When - Then
    expect(isCockroachDBRetryTransaction(error)).toBe(true)
  })
})
