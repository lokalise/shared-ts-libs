import { Either } from '@lokalise/node-core'
import { PrismaClient } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vitest } from 'vitest'

import { cleanTables, DB_MODEL } from '../test/DbCleaner'

import { PRISMA_NOT_FOUND_ERROR, PRISMA_SERIALIZATION_ERROR } from './prismaError'
import { prismaTransaction } from './prismaTransaction'

type Item1 = {
	value: string
}

type Item2 = {
	value: string
}

const TEST_ITEM_1: Item1 = {
	value: 'one',
}
const TEST_ITEM_2: Item2 = {
	value: 'two',
}

describe('prismaTransaction', () => {
	let prisma: PrismaClient

	beforeAll(() => {
		prisma = new PrismaClient({
			datasourceUrl: process.env['DATABASE_URL'],
		})
	})

	beforeEach(async () => {
		await cleanTables(prisma, [DB_MODEL.item1, DB_MODEL.item2])
	})

	afterAll(async () => {
		await prisma.$disconnect()
	})

	describe('with function callback', () => {
		it('first try works', async () => {
			// When
			const result: Either<unknown, Item1> = await prismaTransaction(prisma, (client) =>
				client.item1.create({ data: TEST_ITEM_1 }),
			)

			// Then
			expect(result.result).toMatchObject(TEST_ITEM_1)
		})

		it('interactive transaction returns correct types', async () => {
			expect.assertions(1)

			// When
			await prismaTransaction(prisma, async (client) => {
				const item1 = await client.item1.create({ data: TEST_ITEM_1 })
				expect(item1.value).toMatchObject(TEST_ITEM_1.value)
			})
		})

		it('by default, 3 retries in case of PRISMA_SERIALIZATION_ERROR', async () => {
			// Given
			const retrySpy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
				new PrismaClientKnownRequestError('test', {
					code: PRISMA_SERIALIZATION_ERROR,
					clientVersion: '1',
				}),
			)

			// When
			const result = await prismaTransaction(prisma, (client) =>
				client.item1.create({ data: TEST_ITEM_1 }),
			)

			// Then
			expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
			expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
			expect(retrySpy).toHaveBeenCalledTimes(3)
		})

		it('Modifying max number of retries', async () => {
			// Given
			const retriesAllowed = 5
			const retrySpy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
				new PrismaClientKnownRequestError('test', {
					code: PRISMA_SERIALIZATION_ERROR,
					clientVersion: '1',
				}),
			)

			// When
			const result = await prismaTransaction(
				prisma,
				(client) => client.item1.create({ data: TEST_ITEM_1 }),
				{ retriesAllowed },
			)

			// Then
			expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
			expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
			expect(retrySpy).toHaveBeenCalledTimes(5)
		})

		it('not all prisma code are retried', async () => {
			// Given
			const retrySpy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
				new PrismaClientKnownRequestError('test', {
					code: PRISMA_NOT_FOUND_ERROR,
					clientVersion: '1',
				}),
			)

			// When
			const result = await prismaTransaction(prisma, (client) =>
				client.item1.create({ data: TEST_ITEM_1 }),
			)

			// Then
			expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
			expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_NOT_FOUND_ERROR)
			expect(retrySpy).toHaveBeenCalledTimes(1)
		})

		it('CockroachDB retry transaction error is retried', async () => {
			// Given
			const retrySpy = vitest.spyOn(prisma, '$transaction').mockRejectedValue(
				new PrismaClientKnownRequestError('test', {
					code: 'P100',
					clientVersion: '1',
					meta: { code: '40001' },
				}),
			)

			// When
			const result = await prismaTransaction(prisma, (client) =>
				client.item1.create({ data: TEST_ITEM_1 }),
			)

			// Then
			expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
			expect((result.error as PrismaClientKnownRequestError).meta).toMatchObject({
				code: '40001',
			})
			expect(retrySpy).toHaveBeenCalledTimes(3)
		})
	})

	describe('with array', () => {
		it('works', async () => {
			// When
			const result: Either<unknown, [Item1, Item2]> = await prismaTransaction(prisma, [
				prisma.item1.create({ data: TEST_ITEM_1 }),
				prisma.item2.create({ data: TEST_ITEM_2 }),
			])

			// Then
			expect(result.result).toMatchObject([TEST_ITEM_1, TEST_ITEM_2])
		})
	})
})
