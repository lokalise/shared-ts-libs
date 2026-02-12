import type * as RuntimePrisma from '@prisma/client/runtime/client'
import type { PrismaClient } from '../test/db-client/client.ts'
import type { PrismaClientFactoryOptions } from './types.ts'

const defaultOptions: PrismaClientFactoryOptions = {
  transactionOptions: { isolationLevel: 'ReadCommitted' },
}

type PrismaClientConstructor<P extends PrismaClient> = new (
  options: RuntimePrisma.PrismaClientOptions,
) => P

export const prismaClientFactory = <P extends PrismaClient>(
  PrismaClient: PrismaClientConstructor<P>,
  options: PrismaClientFactoryOptions = {},
): P => {
  options.transactionOptions = {
    ...defaultOptions.transactionOptions,
    ...options.transactionOptions,
  }

  return new PrismaClient(options)
}
