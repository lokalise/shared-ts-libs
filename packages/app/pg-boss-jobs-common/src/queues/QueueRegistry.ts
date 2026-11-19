import { precompileSchema } from '../precompileUtils.ts'
import type { QueueConfiguration, QueueConfigurationForQueue, SupportedQueueIds } from './types.ts'

/**
 * Read-only registry of queue configurations indexed by `queueId`.
 *
 * Registering a configuration precompiles its `jobPayloadSchema`, so payload validation done
 * through the registry takes zod's generated fast path. A schema zod cannot compile keeps using
 * the regular parser.
 */
export class QueueRegistry<const Queues extends readonly QueueConfiguration[]> {
  private readonly queues = new Map<string, Queues[number]>()

  constructor(queues: Queues) {
    for (const queue of queues) {
      if (this.queues.has(queue.queueId)) {
        throw new Error(`Duplicate queue configuration with id "${queue.queueId}"`)
      }

      this.queues.set(queue.queueId, {
        ...queue,
        jobPayloadSchema: precompileSchema(queue.jobPayloadSchema),
      })
    }
  }

  get queueIds(): SupportedQueueIds<Queues>[] {
    return [...this.queues.keys()]
  }

  /**
   * The registered configuration, whose `jobPayloadSchema` is the precompiled counterpart of the
   * one that was passed in. It is a shallow copy of the caller's config, not the same object.
   */
  getQueueConfig<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
  ): QueueConfigurationForQueue<Queues, QueueId> {
    const config = this.queues.get(queueId)
    if (!config) throw new Error(`Queue with id ${queueId} is not supported`)

    return config as QueueConfigurationForQueue<Queues, QueueId>
  }

  all(): Queues[number][] {
    return [...this.queues.values()]
  }
}
