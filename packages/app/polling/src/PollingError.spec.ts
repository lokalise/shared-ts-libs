import { describe, expect, it } from 'vitest'
import { PollingError, PollingFailureCause } from './PollingError.ts'

describe('PollingError', () => {
  describe('construction', () => {
    it('should create error with all properties', () => {
      const error = new PollingError('Test error message', PollingFailureCause.TIMEOUT, 5)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(PollingError)
      expect(error.name).toBe('PollingError')
      expect(error.message).toBe('Test error message')
      expect(error.failureCause).toBe(PollingFailureCause.TIMEOUT)
      expect(error.attemptsMade).toBe(5)
      expect(error.errorCode).toBe('POLLING_TIMEOUT')
    })

    it('should create error with different failure causes', () => {
      const timeoutError = new PollingError('Timeout', PollingFailureCause.TIMEOUT, 10)
      expect(timeoutError.failureCause).toBe(PollingFailureCause.TIMEOUT)
      expect(timeoutError.errorCode).toBe('POLLING_TIMEOUT')

      const cancelledError = new PollingError('Cancelled', PollingFailureCause.CANCELLED, 3)
      expect(cancelledError.failureCause).toBe(PollingFailureCause.CANCELLED)
      expect(cancelledError.errorCode).toBe('POLLING_CANCELLED')
    })

    it('should preserve original error as cause', () => {
      const originalError = new Error('Original error')
      const error = new PollingError(
        'Polling failed',
        PollingFailureCause.TIMEOUT,
        5,
        originalError,
      )

      expect(error.cause).toBe(originalError)
    })
  })

  describe('creating timeout errors', () => {
    it('should create timeout error with correct properties', () => {
      const error = new PollingError(
        'Polling timeout after 10 attempts',
        PollingFailureCause.TIMEOUT,
        10,
      )

      expect(error).toBeInstanceOf(PollingError)
      expect(error.message).toBe('Polling timeout after 10 attempts')
      expect(error.failureCause).toBe(PollingFailureCause.TIMEOUT)
      expect(error.attemptsMade).toBe(10)
      expect(error.errorCode).toBe('POLLING_TIMEOUT')
    })

    it('should work with zero attempts', () => {
      const error = new PollingError(
        'Polling timeout after 0 attempts',
        PollingFailureCause.TIMEOUT,
        0,
      )

      expect(error.message).toBe('Polling timeout after 0 attempts')
      expect(error.attemptsMade).toBe(0)
    })

    it('should work with large attempt numbers', () => {
      const error = new PollingError(
        'Polling timeout after 1000 attempts',
        PollingFailureCause.TIMEOUT,
        1000,
      )

      expect(error.message).toBe('Polling timeout after 1000 attempts')
      expect(error.attemptsMade).toBe(1000)
    })
  })

  describe('creating cancelled errors', () => {
    it('should create cancelled error with correct properties', () => {
      const error = new PollingError(
        'Polling cancelled after 3 attempts',
        PollingFailureCause.CANCELLED,
        3,
      )

      expect(error).toBeInstanceOf(PollingError)
      expect(error.message).toBe('Polling cancelled after 3 attempts')
      expect(error.failureCause).toBe(PollingFailureCause.CANCELLED)
      expect(error.attemptsMade).toBe(3)
      expect(error.errorCode).toBe('POLLING_CANCELLED')
    })

    it('should work when cancelled before any attempts', () => {
      const error = new PollingError(
        'Polling cancelled after 0 attempts',
        PollingFailureCause.CANCELLED,
        0,
      )

      expect(error.message).toBe('Polling cancelled after 0 attempts')
      expect(error.attemptsMade).toBe(0)
    })
  })

  describe('error code generation', () => {
    it('should generate POLLING_TIMEOUT for timeout errors', () => {
      const error = new PollingError('Test', PollingFailureCause.TIMEOUT, 5)
      expect(error.errorCode).toBe('POLLING_TIMEOUT')
    })

    it('should generate POLLING_CANCELLED for cancelled errors', () => {
      const error = new PollingError('Test', PollingFailureCause.CANCELLED, 5)
      expect(error.errorCode).toBe('POLLING_CANCELLED')
    })
  })

  describe('discriminated union support', () => {
    it('should support type discrimination by failureCause', () => {
      const timeoutError = new PollingError(
        'Polling timeout after 10 attempts',
        PollingFailureCause.TIMEOUT,
        10,
      )
      const cancelledError = new PollingError(
        'Polling cancelled after 5 attempts',
        PollingFailureCause.CANCELLED,
        5,
      )

      function handleError(error: PollingError): string {
        switch (error.failureCause) {
          case PollingFailureCause.TIMEOUT:
            return `Timed out after ${error.attemptsMade} attempts`
          case PollingFailureCause.CANCELLED:
            return `Cancelled after ${error.attemptsMade} attempts`
          case PollingFailureCause.INVALID_CONFIG:
            return `Invalid config`
        }
      }

      expect(handleError(timeoutError)).toBe('Timed out after 10 attempts')
      expect(handleError(cancelledError)).toBe('Cancelled after 5 attempts')
    })
  })

  describe('PollingFailureCause constants', () => {
    it('should export correct constant values', () => {
      expect(PollingFailureCause.TIMEOUT).toBe('TIMEOUT')
      expect(PollingFailureCause.CANCELLED).toBe('CANCELLED')
      expect(PollingFailureCause.INVALID_CONFIG).toBe('INVALID_CONFIG')
    })

    it('should have exactly three causes', () => {
      const causes = Object.keys(PollingFailureCause)
      expect(causes).toHaveLength(3)
      expect(causes).toContain('TIMEOUT')
      expect(causes).toContain('CANCELLED')
      expect(causes).toContain('INVALID_CONFIG')
    })
  })

  describe('isPollingError type guard', () => {
    it('should return true for PollingError instances', () => {
      const error = new PollingError('Test', PollingFailureCause.TIMEOUT, 5)
      expect(PollingError.isPollingError(error)).toBe(true)
    })

    it('should return false for regular Error', () => {
      const error = new Error('Regular error')
      expect(PollingError.isPollingError(error)).toBe(false)
    })

    it('should return false for non-error objects', () => {
      expect(PollingError.isPollingError({})).toBe(false)
      expect(PollingError.isPollingError({ message: 'test' })).toBe(false)
      expect(PollingError.isPollingError(null)).toBe(false)
      expect(PollingError.isPollingError(undefined)).toBe(false)
      expect(PollingError.isPollingError('string')).toBe(false)
      expect(PollingError.isPollingError(123)).toBe(false)
    })

    it('should return true for error-like objects with correct properties', () => {
      const errorLike = {
        name: 'PollingError',
        message: 'Test',
        failureCause: 'TIMEOUT',
        attemptsMade: 5,
        errorCode: 'POLLING_TIMEOUT',
      }
      expect(PollingError.isPollingError(errorLike)).toBe(true)
    })

    it('should return false for objects missing required properties', () => {
      expect(PollingError.isPollingError({ name: 'PollingError' })).toBe(false)
      expect(
        PollingError.isPollingError({
          name: 'PollingError',
          failureCause: 'TIMEOUT',
        }),
      ).toBe(false)
      expect(
        PollingError.isPollingError({
          name: 'PollingError',
          failureCause: 'TIMEOUT',
          attemptsMade: 5,
        }),
      ).toBe(false)
    })

    it('should return false for objects with invalid failureCause', () => {
      const invalidError = {
        name: 'PollingError',
        message: 'Test',
        failureCause: 'INVALID_CAUSE', // Not a valid PollingFailureCause
        attemptsMade: 5,
        errorCode: 'POLLING_INVALID_CAUSE',
      }
      expect(PollingError.isPollingError(invalidError)).toBe(false)
    })

    it('should only accept valid PollingFailureCause enum values', () => {
      // Valid causes should return true
      const validTimeoutError = {
        name: 'PollingError',
        message: 'Test',
        failureCause: 'TIMEOUT',
        attemptsMade: 5,
        errorCode: 'POLLING_TIMEOUT',
      }
      expect(PollingError.isPollingError(validTimeoutError)).toBe(true)

      const validCancelledError = {
        name: 'PollingError',
        message: 'Test',
        failureCause: 'CANCELLED',
        attemptsMade: 3,
        errorCode: 'POLLING_CANCELLED',
      }
      expect(PollingError.isPollingError(validCancelledError)).toBe(true)

      const validConfigError = {
        name: 'PollingError',
        message: 'Test',
        failureCause: 'INVALID_CONFIG',
        attemptsMade: 0,
        errorCode: 'POLLING_INVALID_CONFIG',
      }
      expect(PollingError.isPollingError(validConfigError)).toBe(true)

      // Invalid causes should return false
      const invalidCauses = ['UNKNOWN', 'ERROR', 'FAILED', '', 'timeout', 'Timeout']
      for (const invalidCause of invalidCauses) {
        const invalidError = {
          name: 'PollingError',
          message: 'Test',
          failureCause: invalidCause,
          attemptsMade: 5,
          errorCode: 'POLLING_ERROR',
        }
        expect(PollingError.isPollingError(invalidError)).toBe(false)
      }
    })

    it('should provide proper type narrowing in TypeScript', () => {
      const error: unknown = new PollingError('Test', PollingFailureCause.TIMEOUT, 5)

      if (PollingError.isPollingError(error)) {
        // TypeScript should know error is PollingError here
        expect(error.failureCause).toBe('TIMEOUT')
        expect(error.attemptsMade).toBe(5)
        expect(error.errorCode).toBe('POLLING_TIMEOUT')
      } else {
        expect.fail('Should have been a PollingError')
      }
    })
  })

  describe('error handling patterns', () => {
    it('should be catchable as PollingError using type guard (recommended)', () => {
      function mayThrowPollingError(): void {
        throw new PollingError('Polling timeout after 5 attempts', PollingFailureCause.TIMEOUT, 5)
      }

      try {
        mayThrowPollingError()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(PollingError.isPollingError(error)).toBe(true)
        if (PollingError.isPollingError(error)) {
          expect(error.attemptsMade).toBe(5)
        }
      }
    })

    it('should be catchable using isPollingError type guard', () => {
      function mayThrowPollingError(): void {
        throw new PollingError(
          'Polling cancelled after 3 attempts',
          PollingFailureCause.CANCELLED,
          3,
        )
      }

      try {
        mayThrowPollingError()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(PollingError.isPollingError(error)).toBe(true)
        if (PollingError.isPollingError(error)) {
          expect(error.errorCode).toBe('POLLING_CANCELLED')
        }
      }
    })

    it('should be catchable using instanceof', () => {
      function mayThrowPollingError(): void {
        throw new PollingError('Polling timeout', PollingFailureCause.TIMEOUT, 10)
      }

      try {
        mayThrowPollingError()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        if (error instanceof PollingError) {
          expect(error.errorCode).toBe('POLLING_TIMEOUT')
        }
      }
    })

    it('should support instanceof checks in catch blocks', () => {
      const errors = [
        new PollingError('Polling timeout after 10 attempts', PollingFailureCause.TIMEOUT, 10),
        new PollingError('Polling cancelled after 5 attempts', PollingFailureCause.CANCELLED, 5),
        new Error('Other'),
      ]

      const results = errors.map((error) => {
        if (PollingError.isPollingError(error)) {
          return `polling:${error.failureCause}`
        }
        return 'other'
      })

      expect(results).toEqual(['polling:TIMEOUT', 'polling:CANCELLED', 'other'])
    })
  })
})
