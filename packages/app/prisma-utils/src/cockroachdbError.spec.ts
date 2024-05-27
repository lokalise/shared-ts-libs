import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { describe, expect, it } from 'vitest'

import { isCockroachDBRetryTransaction } from './cockroachdbError'
import { PRISMA_SERIALIZATION_ERROR } from './prismaError'

describe('cockroachdbError', () => {
	it('without meta should return false', () => {
		// Given
		const error = new PrismaClientKnownRequestError('test', {
			code: PRISMA_SERIALIZATION_ERROR,
			clientVersion: '1',
		})

		// When - Then
		expect(isCockroachDBRetryTransaction(error)).toBe(false)
	})

	it('wrong meta field', () => {
		// Given
		const error = new PrismaClientKnownRequestError('test', {
			code: 'P100',
			clientVersion: '1',
			meta: { wrong: 'meta' },
		})

		// When - Then
		expect(isCockroachDBRetryTransaction(error)).toBe(false)
	})

	it('wrong meta.code', () => {
		// Given
		const error = new PrismaClientKnownRequestError('test', {
			code: 'P100',
			clientVersion: '1',
			meta: { code: '40002' },
		})

		// When - Then
		expect(isCockroachDBRetryTransaction(error)).toBe(false)
	})

	it('is CockroachDb retry transaction error', () => {
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
