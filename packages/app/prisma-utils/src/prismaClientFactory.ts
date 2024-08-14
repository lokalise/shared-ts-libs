import { PrismaClient } from '@prisma/client'
import type { PrismaClientFactoryOptions } from './types'

const defaultOptions: PrismaClientFactoryOptions = {
  transactionOptions: { isolationLevel: 'ReadCommitted' },
}

export const prismaClientFactory = (options: PrismaClientFactoryOptions = {}): PrismaClient => {
  options.transactionOptions = {
    ...defaultOptions.transactionOptions,
    ...options.transactionOptions,
  }

  //@ts-expect-error - ReadCommitted is not accepted by Prisma atm
  return new PrismaClient(options)
}
