import { randomUUID } from 'node:crypto'
import type { CommonLogger } from '@lokalise/node-core'
import { stdSerializers } from 'pino'
import { AsyncTask } from 'toad-scheduler'
import type { AbstractPeriodicJob } from './AbstractPeriodicJob'

export function createTask(logger: CommonLogger, job: AbstractPeriodicJob): AsyncTask {
  const executorId = randomUUID()

  logger.info({
    msg: 'Periodic job registered',
    jobId: job.jobId,
    executorId,
  })

  return new AsyncTask(
    job.jobId,
    () => {
      return job.process(executorId)
    },
    /* v8 ignore next 9 */
    (error) => {
      logger.error(
        stdSerializers.err({
          name: error.name,
          message: error.message,
          stack: error.stack,
        }),
      )
    },
  )
}
