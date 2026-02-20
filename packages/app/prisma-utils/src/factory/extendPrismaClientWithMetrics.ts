import type { Either } from '@lokalise/node-core'
import type { PrismaClient } from 'prisma/client/client.ts'
import type Prometheus from 'prom-client'

export const extendPrismaClientWithMetrics = <Client extends PrismaClient>(
  prisma: Client,
  promClient: typeof Prometheus,
): Client => createExtendedClient(prisma, registerMetricsIfNeeded(promClient)) as Client

type CommonLabels = 'model' | 'operation'
type QueryMetrics = {
  queriesTotal: Prometheus.Counter<CommonLabels | 'status'>
  queryDuration: Prometheus.Histogram<CommonLabels>
  errorsTotal: Prometheus.Counter<CommonLabels | 'error_code'>
}
const METRICS_PREFIX = 'prisma'

const createExtendedClient = (prisma: PrismaClient, metrics: QueryMetrics) => {
  return prisma.$extends({
    name: 'metrics-collector',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const startTime = Date.now()
          const resolvedModel = model ?? 'unknown'
          let result: Either<unknown, unknown> = { result: undefined }

          try {
            const response = await query(args)
            result = { result: response }
          } catch (error) {
            result = { error }
          } finally {
            const duration = (Date.now() - startTime) / 1000

            // Always record metrics (success or error)
            metrics.queriesTotal.inc({
              model: resolvedModel,
              operation,
              status: result.error ? 'error' : 'success',
            })

            metrics.queryDuration.observe({ model: resolvedModel, operation }, duration)

            if (result.error) {
              const errorCode = (result.error as Error & { code?: string })?.code || 'unknown'
              metrics.errorsTotal.inc({
                model: resolvedModel,
                operation,
                error_code: errorCode,
              })
            }
          }

          if (result.error) throw result.error
          return result.result
        },
      },
    },
  })
}

/**
 * Register Prometheus metrics if they don't already exist
 */
const registerMetricsIfNeeded = (promClient: typeof Prometheus): QueryMetrics => {
  const existingMetrics = getExistingMetrics(promClient)
  if (existingMetrics) return existingMetrics

  const queriesTotal = new promClient.Counter({
    name: `${METRICS_PREFIX}_queries_total`,
    help: 'Total number of Prisma queries executed',
    labelNames: ['model', 'operation', 'status'],
    registers: [promClient.register],
  })

  const queryDuration = new promClient.Histogram({
    name: `${METRICS_PREFIX}_query_duration_seconds`,
    help: 'Duration of Prisma queries in seconds',
    labelNames: ['model', 'operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [promClient.register],
  })

  const errorsTotal = new promClient.Counter({
    name: `${METRICS_PREFIX}_errors_total`,
    help: 'Total number of Prisma query errors',
    labelNames: ['model', 'operation', 'error_code'],
    registers: [promClient.register],
  })

  return { queriesTotal, queryDuration, errorsTotal }
}

/**
 * Check if metrics already exist in the registry
 */
const getExistingMetrics = (promClient: typeof Prometheus): QueryMetrics | null => {
  try {
    const queriesTotal = promClient.register.getSingleMetric(`${METRICS_PREFIX}_queries_total`)
    const queryDuration = promClient.register.getSingleMetric(
      `${METRICS_PREFIX}_query_duration_seconds`,
    )
    const errorsTotal = promClient.register.getSingleMetric(`${METRICS_PREFIX}_errors_total`)

    if (queriesTotal && queryDuration && errorsTotal) {
      return { queriesTotal, queryDuration, errorsTotal } as QueryMetrics
    }
  } catch {
    // If any error occurs (e.g. metrics not found), return null to create new metrics
  }

  return null
}
