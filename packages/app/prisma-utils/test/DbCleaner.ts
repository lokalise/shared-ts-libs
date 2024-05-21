import type { PrismaClient } from '@prisma/client'

export enum DB_MODEL {
	item1 = 'item1',
	item2 = 'item2',
}

export async function cleanTables(
	prisma: PrismaClient,
	modelNames: readonly DB_MODEL[],
	schema: string,
) {
	for (const table of Object.values(modelNames)) {
		await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${schema}.${table} CASCADE;`)
	}
}
