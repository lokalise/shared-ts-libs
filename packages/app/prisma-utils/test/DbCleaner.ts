import type { PrismaClient } from 'prisma/client/client.ts'

export const DB_MODEL = {
  item1: 'item1',
  item2: 'item2',
} as const
export type DbModel = (typeof DB_MODEL)[keyof typeof DB_MODEL]

export async function cleanTables(prisma: PrismaClient, modelNames: readonly DbModel[]) {
  const delegates = modelNames.map<{ deleteMany: () => Promise<unknown> }>(
    (modelName) => prisma[modelName],
  )

  for (const delegate of delegates) {
    await delegate.deleteMany()
  }
}
