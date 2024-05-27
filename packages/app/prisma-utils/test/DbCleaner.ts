import type { PrismaClient } from '@prisma/client'

export class DbCleaner<DbModel extends object> {
	private readonly schema: string
	private readonly tableNames: string[]

	constructor(schema: string, dbModel: DbModel) {
		this.schema = schema
		this.tableNames = Object.values(dbModel)
	}

	async cleanTables(prisma: PrismaClient) {
		for (const table of this.tableNames) {
			await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${this.schema}.${table} CASCADE;`)
		}
	}
}
