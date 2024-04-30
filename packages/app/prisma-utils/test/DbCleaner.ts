import type { PrismaClient } from '@prisma/client'

export enum DB_MODEL {
	item1 = 'item1',
	item2 = 'item2',
}

export async function cleanTables(prisma: PrismaClient, modelNames: readonly DB_MODEL[]) {
	const delegates = modelNames.map<{ deleteMany: () => Promise<unknown> }>(
		(modelName) => prisma[modelName],
	)

	for (const delegate of delegates) {
		await delegate.deleteMany()
	}
}
