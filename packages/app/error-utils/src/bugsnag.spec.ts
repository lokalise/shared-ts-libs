import Bugsnag from '@bugsnag/js'
import { FreeformRecord, InternalError, PublicNonRecoverableError } from '@lokalise/node-core'
import { describe, expect, it, vi } from 'vitest'

import { reportErrorToBugsnag } from './bugsnag'

describe('bugsnag', () => {
	describe('reportErrorToBugsnag', () => {
		it('not started', () => {
			// Given
			const startSpy = vi.spyOn(Bugsnag, 'isStarted').mockReturnValue(false)
			const notifySpy = vi.spyOn(Bugsnag, 'notify')

			// When
			reportErrorToBugsnag({ error: new Error('test') })

			// Then
			expect(startSpy).toHaveBeenCalled()
			expect(notifySpy).not.toHaveBeenCalled()
		})

		it('using Error', async () => {
			// Given
			vi.spyOn(Bugsnag, 'isStarted').mockReturnValue(true)
			const notifySpy = vi.spyOn(Bugsnag, 'notify').mockReturnValue(undefined)

			// When
			reportErrorToBugsnag({ error: new Error('test') })

			// Then
			expect(notifySpy).toHaveBeenCalled()

			const callback = notifySpy.mock.calls[0][1]
			const event = { addMetadata: (_, __) => undefined } as any
			await callback(event, () => {})
			expect(event).toMatchObject({ severity: 'error', unhandled: true })
		})

		it('custom severity and unhandled', async () => {
			// Given
			vi.spyOn(Bugsnag, 'isStarted').mockReturnValue(true)
			const notifySpy = vi.spyOn(Bugsnag, 'notify').mockReturnValue(undefined)

			// When
			reportErrorToBugsnag({ error: new Error('test'), severity: 'info', unhandled: false })

			// Then
			expect(notifySpy).toHaveBeenCalled()

			const callback = notifySpy.mock.calls[0][1]
			const event = { addMetadata: (_, __) => undefined } as any
			await callback(event, () => {})
			expect(event).toMatchObject({ severity: 'info', unhandled: false })
		})

		it('internal error', async () => {
			// Given
			vi.spyOn(Bugsnag, 'isStarted').mockReturnValue(true)
			const notifySpy = vi.spyOn(Bugsnag, 'notify').mockReturnValue(undefined)

			// When
			reportErrorToBugsnag({
				error: new InternalError({
					errorCode: 'TEST_ERROR_CODE',
					message: 'test',
					details: { hello: 'world' },
				}),
				context: { good: 'bye' },
			})

			// Then
			expect(notifySpy).toHaveBeenCalled()

			const callback = notifySpy.mock.calls[0][1]
			let context = {}
			const event = {
				addMetadata: (key, obj) => {
					if (key === 'Context') context = obj
					else throw new Error('wrong key')
				},
			} as any
			await callback(event, () => {})
			expect(event).toMatchObject({ severity: 'error', unhandled: true })
			expect(context).toMatchObject({
				good: 'bye',
				errorCode: 'TEST_ERROR_CODE',
				errorDetails: { hello: 'world' },
			})
		})

		it('public non recoverable error', async () => {
			// Given
			vi.spyOn(Bugsnag, 'isStarted').mockReturnValue(true)
			const notifySpy = vi.spyOn(Bugsnag, 'notify').mockReturnValue(undefined)

			// When
			reportErrorToBugsnag({
				error: new PublicNonRecoverableError({
					errorCode: 'TEST_ERROR_CODE',
					message: 'test',
					details: { hello: 'world' },
				}),
				context: { good: 'bye' },
			})

			// Then
			expect(notifySpy).toHaveBeenCalled()

			const callback = notifySpy.mock.calls[0][1]
			let context = {}
			const event = {
				addMetadata: (key, obj) => {
					if (key === 'Context') context = obj
					else throw new Error('wrong key')
				},
			} as any
			await callback(event, () => {})
			expect(event).toMatchObject({ severity: 'error', unhandled: true })
			expect(context).toMatchObject({
				good: 'bye',
				errorCode: 'TEST_ERROR_CODE',
				errorDetails: { hello: 'world' },
			})
		})

		it('unknown error with details field', async () => {
			// Given
			vi.spyOn(Bugsnag, 'isStarted').mockReturnValue(true)
			const notifySpy = vi.spyOn(Bugsnag, 'notify').mockReturnValue(undefined)

			// When
			reportErrorToBugsnag({
				error: new CustomError('test', { hello: 'world' }),
				context: { good: 'bye' },
			})

			// Then
			expect(notifySpy).toHaveBeenCalled()

			const callback = notifySpy.mock.calls[0][1]
			let context = {}
			const event = {
				addMetadata: (key, obj) => {
					if (key === 'Context') context = obj
					else throw new Error('wrong key')
				},
			} as any
			await callback(event, () => {})
			expect(event).toMatchObject({ severity: 'error', unhandled: true })
			expect(context).toMatchObject({
				good: 'bye',
				errorDetails: { hello: 'world' },
			})
		})
	})
})

class CustomError extends Error {
	public readonly details: FreeformRecord
	constructor(message: string, details: FreeformRecord) {
		super(message)
		this.details = details
	}
}
