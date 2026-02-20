import type * as RuntimePrisma from '@prisma/client/runtime/client'
import type { PrismaClient } from 'prisma/client/client.ts'
import type { PrismaClientConstructor } from 'prisma/client/internal/class.ts'
import type Prometheus from 'prom-client'
import { extendPrismaClientWithMetrics } from './extendPrismaClientWithMetrics.ts'

export type prismaClientFactoryOptions = {
  promClient?: typeof Prometheus
}

/**
 * Factory function to create a Prisma client instance with default configuration
 * and optional Prometheus metrics integration.
 *
 * @template Client - The Prisma client type to instantiate
 * @param builder - The Prisma client constructor
 * @param options - Prisma client initialization options
 * @param factoryOptions - Optional factory configuration
 * @param factoryOptions.promClient - Prometheus client instance to enable metrics collection
 * @returns A configured Prisma client instance, optionally extended with metrics
 *
 */
export const prismaClientFactory = <Client extends PrismaClient>(
  builder: PrismaClientConstructor,
  options: RuntimePrisma.PrismaClientOptions,
  factoryOptions?: prismaClientFactoryOptions,
): Client => {
  options.transactionOptions = {
    isolationLevel: 'ReadCommitted',
    ...options.transactionOptions,
  }

  // @ts-expect-error
  let prismaClient = new builder(options)
  if (factoryOptions?.promClient) {
    prismaClient = extendPrismaClientWithMetrics(prismaClient, factoryOptions.promClient)
  }

  return prismaClient as Client
}
