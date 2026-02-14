import type * as RuntimePrisma from '@prisma/client/runtime/client'
import type { PrismaClient } from '../test/db-client/client.ts'
import type { PrismaClientConstructor } from '../test/db-client/internal/class.ts'

export const prismaClientFactory = <P extends PrismaClient>(
  PrismaClient: PrismaClientConstructor,
  options: RuntimePrisma.PrismaClientOptions,
): P => {
  options.transactionOptions = {
    isolationLevel: 'ReadCommitted',
    ...options.transactionOptions,
  }

  // @ts-expect-error
  return new PrismaClient(options)
}
