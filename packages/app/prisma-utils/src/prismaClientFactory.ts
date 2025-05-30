import type { Prisma, PrismaClient } from '@prisma/client'
import type { PrismaClientFactoryOptions } from './types.ts'

const defaultOptions: PrismaClientFactoryOptions = {
  transactionOptions: { isolationLevel: 'ReadCommitted' },
}

type PrismaClientConstructor<P extends PrismaClient> = new (
  options: Prisma.PrismaClientOptions,
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
