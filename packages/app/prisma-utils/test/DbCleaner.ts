import type { PrismaClient } from '@prisma/client'

export class DbCleaner<DbModel extends object> {
	private readonly schema: string

	constructor(schema: string) {
		this.schema = schema
	}

	async cleanTables(prisma: PrismaClient, dbModel: DbModel) {
		for (const table of Object.values(dbModel)) {
			await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${this.schema}.${table} CASCADE;`)
		}
	}
}
