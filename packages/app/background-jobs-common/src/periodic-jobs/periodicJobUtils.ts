import { randomUUID } from 'node:crypto'
import type { CommonLogger } from '@lokalise/node-core'
import { stdSerializers } from 'pino'
import { AsyncTask } from 'toad-scheduler'
import type { AbstractPeriodicJob } from './AbstractPeriodicJob.ts'

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
    /* v8 ignore start */
    (error) => {
      logger.error(
        stdSerializers.err({
          name: error.name,
          message: error.message,
          stack: error.stack,
        }),
      )
    },
    /* v8 ignore stop */
  )
}
