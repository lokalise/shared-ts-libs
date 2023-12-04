import { InternalError, PublicNonRecoverableError } from '@lokalise/node-core'

import { isAutopilotError, isObject } from '../src'

describe('typeUtils', () => {
	describe('isObject', () => {
		it('true for object', () => {
			const error = new InternalError({
				message: 'dummy',
				errorCode: 'code',
			})

			expect(isObject(error)).toBe(true)
		})

		it('false for non-object', () => {
			const error = 'error'

			expect(isObject(error)).toBe(false)
		})

		it('false for null', () => {
			const error = null

			expect(isObject(error)).toBe(false)
		})
	})

	describe('isAutopilotError', () => {
		it('true for standardized error', () => {
			const error = {
				message: 'dummy',
				errorCode: 'code',
			}

			expect(isAutopilotError(error)).toBe(true)
		})

		it('true for InternalError', () => {
			const error = new InternalError({
				message: 'dummy',
				errorCode: 'code',
			})

			expect(isAutopilotError(error)).toBe(true)
		})

		it('true for PublicNonRecoverableError', () => {
			const error = new PublicNonRecoverableError({
				message: 'dummy',
				httpStatusCode: 400,
				errorCode: 'code',
			})

			expect(isAutopilotError(error)).toBe(true)
		})

		it('false for non standardized error', () => {
			const error = new Error()

			expect(isAutopilotError(error)).toBe(false)
		})
	})
})
