import Bugsnag from '@bugsnag/node'
import { describe, expect, it, vi } from 'vitest'
import {
  addFeatureFlag,
  bugsnagErrorReporter,
  reportErrorToBugsnag,
  startBugsnag,
} from './bugsnag.ts'

const BugsnagClient = Bugsnag.default

class CustomError extends Error {
  public readonly details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown>, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.details = details
  }
}

class CustomErrorWithCode extends CustomError {
  public readonly errorCode: string

  constructor(
    message: string,
    details: Record<string, unknown>,
    errorCode: string,
    cause?: unknown,
  ) {
    super(message, details, cause)
    this.errorCode = errorCode
  }
}

describe('bugsnag', () => {
  describe('reportErrorToBugsnag', () => {
    it('not started', () => {
      // Given
      const startSpy = vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(false)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify')

      // When
      reportErrorToBugsnag({ error: new Error('test') })

      // Then
      expect(startSpy).toHaveBeenCalled()
      expect(notifySpy).not.toHaveBeenCalled()
    })

    it('using Error', async () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      // When
      reportErrorToBugsnag({ error: new Error('test') })

      // Then
      expect(notifySpy).toHaveBeenCalled()

      const callback = notifySpy.mock.calls[0]![1]
      const event = { addMetadata: () => undefined } as any
      await callback!(event, () => {})
      expect(event).toMatchObject({ severity: 'error', unhandled: true })
    })

    it('custom severity and unhandled', async () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      // When
      reportErrorToBugsnag({ error: new Error('test'), severity: 'info', unhandled: false })

      // Then
      expect(notifySpy).toHaveBeenCalled()

      const callback = notifySpy.mock.calls[0]![1]
      const event = { addMetadata: () => undefined } as any
      await callback!(event, () => {})
      expect(event).toMatchObject({ severity: 'info', unhandled: false })
    })

    it('internal error', async () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      // When
      reportErrorToBugsnag({
        error: new CustomErrorWithCode('test', { hello: 'world' }, 'TEST_ERROR_CODE'),
        context: { good: 'bye' },
      })

      // Then
      expect(notifySpy).toHaveBeenCalled()

      const callback = notifySpy.mock.calls[0]![1]
      let context: unknown = {}
      const event = {
        addMetadata: (key: unknown, obj: unknown) => {
          if (key === 'Context') context = obj
          else throw new Error('wrong key')
        },
      } as any
      await callback!(event, () => {})
      expect(event).toMatchObject({ severity: 'error', unhandled: true })
      expect(context).toMatchObject({
        good: 'bye',
        err: { errorCode: 'TEST_ERROR_CODE', details: { hello: 'world' } },
      })
    })

    it('public non recoverable error', async () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      // When
      reportErrorToBugsnag({
        error: new CustomErrorWithCode('test', { hello: 'world' }, 'TEST_ERROR_CODE'),
        context: { good: 'bye' },
      })

      // Then
      expect(notifySpy).toHaveBeenCalled()

      const callback = notifySpy.mock.calls[0]![1]!
      let context: unknown = {}
      const event = {
        addMetadata: (key: unknown, obj: unknown) => {
          if (key === 'Context') context = obj
          else throw new Error('wrong key')
        },
      } as any
      await callback(event, () => {})
      expect(event).toMatchObject({ severity: 'error', unhandled: true })
      expect(context).toMatchObject({
        good: 'bye',
        err: { errorCode: 'TEST_ERROR_CODE', details: { hello: 'world' } },
      })
    })

    it('error caused by another error with details', async () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      const rootCause = new CustomError('root cause', { statusCode: 400, body: 'invalid payload' })
      const intermediateCause = new CustomErrorWithCode(
        'intermediate',
        { step: 'intermediate' },
        'INTERMEDIATE_ERROR_CODE',
        rootCause,
      )

      // When
      reportErrorToBugsnag({
        error: new CustomErrorWithCode(
          'test',
          { hello: 'world' },
          'TEST_ERROR_CODE',
          intermediateCause,
        ),
        context: { good: 'bye' },
      })

      // Then
      expect(notifySpy).toHaveBeenCalled()

      const callback = notifySpy.mock.calls[0]![1]
      let context: unknown = {}
      const event = {
        addMetadata: (key: unknown, obj: unknown) => {
          if (key === 'Context') context = obj
          else throw new Error('wrong key')
        },
      } as any
      await callback!(event, () => {})
      expect(context).toMatchObject({
        good: 'bye',
        err: {
          errorCode: 'TEST_ERROR_CODE',
          details: { hello: 'world' },
          cause: {
            errorCode: 'INTERMEDIATE_ERROR_CODE',
            details: { step: 'intermediate' },
            cause: {
              details: { statusCode: 400, body: 'invalid payload' },
            },
          },
        },
      })
    })

    it('unknown error with details field', async () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      // When
      reportErrorToBugsnag({
        error: new CustomError('test', { hello: 'world' }),
        context: { good: 'bye' },
      })

      // Then
      expect(notifySpy).toHaveBeenCalled()

      const callback = notifySpy.mock.calls[0]![1]
      let context: unknown = {}
      const event = {
        addMetadata: (key: unknown, obj: unknown) => {
          if (key === 'Context') context = obj
          else throw new Error('wrong key')
        },
      } as any
      await callback!(event, () => {})
      expect(event).toMatchObject({ severity: 'error', unhandled: true })
      expect(context).toMatchObject({
        good: 'bye',
        err: { details: { hello: 'world' } },
      })
    })
  })

  describe('startBugsnag', () => {
    it('starts Bugsnag when not already started', () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(false)
      const startSpy = vi.spyOn(BugsnagClient, 'start').mockReturnValue(undefined as never)

      // When
      startBugsnag({ apiKey: 'test' })

      // Then
      expect(startSpy).toHaveBeenCalledWith({ apiKey: 'test' })
    })

    it('does not start Bugsnag when already started', () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const startSpy = vi.spyOn(BugsnagClient, 'start')

      // When
      startBugsnag({ apiKey: 'test' })

      // Then
      expect(startSpy).not.toHaveBeenCalled()
    })
  })

  describe('addFeatureFlag', () => {
    it('delegates to the Bugsnag client', () => {
      // Given
      const addFeatureFlagSpy = vi.spyOn(BugsnagClient, 'addFeatureFlag').mockReturnValue(undefined)

      // When
      addFeatureFlag('my-flag', 'variant-a')

      // Then
      expect(addFeatureFlagSpy).toHaveBeenCalledWith('my-flag', 'variant-a')
    })
  })

  describe('bugsnagErrorReporter', () => {
    it('reports via reportErrorToBugsnag', () => {
      // Given
      vi.spyOn(BugsnagClient, 'isStarted').mockReturnValue(true)
      const notifySpy = vi.spyOn(BugsnagClient, 'notify').mockReturnValue(undefined)

      // When
      bugsnagErrorReporter.report({ error: new Error('test') })

      // Then
      expect(notifySpy).toHaveBeenCalled()
    })
  })
})
