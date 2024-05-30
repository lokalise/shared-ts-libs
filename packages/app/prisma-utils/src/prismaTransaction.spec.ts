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
			// following assertions are to make sure types are correct
			expect(result.result.value).toMatchObject(TEST_ITEM_1.value)
		})

		it('interactive transaction returns correct types', async () => {
			// When
			const result = await prismaTransaction(
				prisma,
				async (client) => {
					return await client.item1.create({ data: TEST_ITEM_1 })
				},
				{
					DbDriver: 'CockroachDb',
				},
			)

			// Then
			expect(result.result.value).toMatchObject(TEST_ITEM_1.value)
			expect(result.result.id).toBeDefined()
		})

		it('default reties (3) and delay (100)', async () => {
			// Given
			const callsTimestamps: number[] = []
			const retrySpy = vitest.spyOn(prisma, '$transaction').mockImplementation(() => {
				callsTimestamps.push(Date.now())
				throw new PrismaClientKnownRequestError('test', {
					code: PRISMA_SERIALIZATION_ERROR,
					clientVersion: '1',
				})
			})

			// When
			const result = await prismaTransaction(prisma, (client) =>
				client.item1.create({ data: TEST_ITEM_1 }),
			)

			// Then
			expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
			expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
			expect(retrySpy).toHaveBeenCalledTimes(3)

			const diffs = []
			callsTimestamps.forEach((t, i) => {
				if (i > 0) diffs.push(t - callsTimestamps[i - 1])
			})
			expect(diffs).toHaveLength(2)
			expect(diffs[0] >= 100 && diffs[0] < 105).toBe(true)
			expect(diffs[1] >= 200 && diffs[1] < 205).toBe(true)
		})

		it('modifying max number of retries and base delay', async () => {
			// Given
			const retriesAllowed = 5
			const baseRetryDelayMs = 50

			const callsTimestamps: number[] = []
			const retrySpy = vitest.spyOn(prisma, '$transaction').mockImplementation(() => {
				callsTimestamps.push(Date.now())
				throw new PrismaClientKnownRequestError('test', {
					code: PRISMA_SERIALIZATION_ERROR,
					clientVersion: '1',
				})
			})

			// When
			const result = await prismaTransaction(
				prisma,
				(client) => client.item1.create({ data: TEST_ITEM_1 }),
				{ retriesAllowed, baseRetryDelayMs },
			)

			// Then
			expect(result.error).toBeInstanceOf(PrismaClientKnownRequestError)
			expect((result.error as PrismaClientKnownRequestError).code).toBe(PRISMA_SERIALIZATION_ERROR)
			expect(retrySpy).toHaveBeenCalledTimes(5)

			const diffs = []
			callsTimestamps.forEach((t, i) => {
				if (i > 0) diffs.push(t - callsTimestamps[i - 1])
			})
			expect(diffs).toHaveLength(4)
			expect(diffs[0] >= 50 && diffs[0] < 55).toBe(true)
			expect(diffs[1] >= 100 && diffs[1] < 105).toBe(true)
			expect(diffs[2] >= 200 && diffs[2] < 205).toBe(true)
			expect(diffs[3] >= 400 && diffs[3] < 405).toBe(true)
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
			const result = await prismaTransaction(
				prisma,
				(client) => client.item1.create({ data: TEST_ITEM_1 }),
				{ DbDriver: 'CockroachDb' },
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

		it('returns proper types', async () => {
			// When
			const result = await prismaTransaction(prisma, [
				prisma.item1.create({ data: TEST_ITEM_1 }),
				prisma.item2.create({ data: TEST_ITEM_2 }),
			])

			// Then
			expect(result.result).toMatchObject([TEST_ITEM_1, TEST_ITEM_2])
			expect(result.result[0].value).toBe(TEST_ITEM_1.value)
			expect(result.result[0].id).toBeDefined()
			expect(result.result[1].value).toBe(TEST_ITEM_2.value)
			expect(result.result[1].id).toBeDefined()
		})
	})
})
