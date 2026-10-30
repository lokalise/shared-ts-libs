import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client'
import { describe, expect, it, vi } from 'vitest'
import { PRISMA_SERIALIZATION_ERROR } from '../errors/index.ts'
import { retryOnSerializationFailure } from './retryOnSerializationFailure.ts'

const OPTIONS = { baseRetryDelayMs: 1 }

const driverAdapterError = (originalCode: string, kind: string) =>
  new PrismaClientKnownRequestError('test', {
    code: 'P2010',
    clientVersion: '1',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { kind, originalCode },
      },
    },
  })

const CRDB_DRIVER_ADAPTER_ERROR = driverAdapterError('40001', 'TransactionWriteConflict')
const CRDB_QUERY_ENGINE_ERROR = new PrismaClientKnownRequestError('test', {
  code: 'P2010',
  clientVersion: '1',
  meta: { code: '40001' },
})
const PRISMA_SERIALIZATION_FAILURE = new PrismaClientKnownRequestError('test', {
  code: PRISMA_SERIALIZATION_ERROR,
  clientVersion: '1',
})

describe('retryOnSerializationFailure', () => {
  it('should return the result without retrying when the query succeeds', async () => {
    // Given
    const query = vi.fn().mockResolvedValue('result')

    // When
    const result = await retryOnSerializationFailure(query, OPTIONS)

    // Then
    expect(result).toBe('result')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a driver adapter serialization failure', CRDB_DRIVER_ADAPTER_ERROR],
    ['a query engine serialization failure', CRDB_QUERY_ENGINE_ERROR],
    ['a prisma serialization error', PRISMA_SERIALIZATION_FAILURE],
  ])('should retry on %s', async (_, error) => {
    // Given
    const query = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('result')

    // When
    const result = await retryOnSerializationFailure(query, OPTIONS)

    // Then
    expect(result).toBe('result')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('should rethrow the last error once the retries are exhausted', async () => {
    // Given
    const query = vi.fn().mockRejectedValue(CRDB_DRIVER_ADAPTER_ERROR)

    // When - Then
    await expect(retryOnSerializationFailure(query, OPTIONS)).rejects.toBe(
      CRDB_DRIVER_ADAPTER_ERROR,
    )
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('should honor retriesAllowed', async () => {
    // Given
    const query = vi.fn().mockRejectedValue(CRDB_DRIVER_ADAPTER_ERROR)

    // When - Then
    await expect(
      retryOnSerializationFailure(query, { ...OPTIONS, retriesAllowed: 4 }),
    ).rejects.toBe(CRDB_DRIVER_ADAPTER_ERROR)
    expect(query).toHaveBeenCalledTimes(5)
  })

  it('should rethrow a non retryable SQLSTATE immediately', async () => {
    // Given
    const error = driverAdapterError('23505', 'UniqueConstraintViolation')
    const query = vi.fn().mockRejectedValue(error)

    // When - Then
    await expect(retryOnSerializationFailure(query, OPTIONS)).rejects.toBe(error)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('should rethrow a non prisma error immediately', async () => {
    // Given
    const error = new Error('boom')
    const query = vi.fn().mockRejectedValue(error)

    // When - Then
    await expect(retryOnSerializationFailure(query, OPTIONS)).rejects.toBe(error)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('should back off exponentially between retries', async () => {
    // Given
    const query = vi.fn().mockRejectedValue(CRDB_DRIVER_ADAPTER_ERROR)
    const start = Date.now()

    // When
    await expect(
      retryOnSerializationFailure(query, { baseRetryDelayMs: 20, maxRetryDelayMs: 30 }),
    ).rejects.toBe(CRDB_DRIVER_ADAPTER_ERROR)

    // Then - 20ms + min(40, 30)ms
    expect(Date.now() - start).toBeGreaterThanOrEqual(50)
  })
})
