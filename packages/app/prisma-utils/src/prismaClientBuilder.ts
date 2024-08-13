import { PrismaClient } from '@prisma/client'
import type { PrismaClientBuilderOptions } from './types'

const defaultOptions: PrismaClientBuilderOptions = {
  transactionOptions: { isolationLevel: 'ReadCommitted' },
}

export const prismaClientBuilder = (options: PrismaClientBuilderOptions): PrismaClient => {
  const resolveOptions = { ...options }
  resolveOptions.transactionOptions = {
    ...defaultOptions.transactionOptions,
    ...options.transactionOptions,
  }

  //@ts-expect-error - ReadCommitted is not accepted by Prisma atm
  return new PrismaClient(resolveOptions)
}
