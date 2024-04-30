import { Either } from '@lokalise/node-core'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vitest } from 'vitest'

import { PRISMA_NOT_FOUND_ERROR, PRISMA_SERIALIZATION_ERROR } from './prismaError'
import { prismaTransaction } from './prismaTransaction'
import { PrismaClient } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { cleanTables, DB_MODEL } from '../test/DbCleaner'

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

	afterEach(async () => {
		vitest.resetAllMocks()
		vitest.restoreAllMocks()
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

		it('Only PRISMA_SERIALIZATION_ERROR code is retried', async () => {
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
