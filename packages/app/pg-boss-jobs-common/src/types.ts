import type { CommonLogger } from '@lokalise/node-core'
import { z } from 'zod/v4'

/** Same shape as `RequestContext` in `@lokalise/background-jobs-common`, so the two are interchangeable. */
export interface RequestContext {
  logger: CommonLogger
  reqId: string
}

export const BASE_JOB_PAYLOAD_SCHEMA = z.object({
  metadata: z.object({
    correlationId: z.string(),
  }),
})
export type BaseJobPayload = z.infer<typeof BASE_JOB_PAYLOAD_SCHEMA>
