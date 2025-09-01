import { groupByUnique } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import type { SQSCreationConfig, SQSQueueLocatorType } from '@message-queue-toolkit/sqs'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { CommandConfig } from '../event-routing/eventRoutingConfig.ts'
import { getSqsTags } from '../tags/index.ts'
import { createRequestContextPreHandler } from './prehandlers/createRequestContextPreHandler.ts'
import type {
  MessageQueueToolkitOptionsResolverConfig,
  ResolvedSqsConsumerBuildOptions,
  ResolveSqsConsumerBuildOptionsParams,
} from './types.ts'
import { QUEUE_NAME_REGEX } from './utils.ts'

type ResolvedQueueResult =
  | {
      locatorConfig: SQSQueueLocatorType
      createCommand?: never
    }
  | {
      locatorConfig?: never
      createCommand: SQSCreationConfig
    }

const MESSAGE_TYPE_FIELD = 'type'
const DLQ_SUFFIX = '-dlq'
const DLQ_MAX_RECEIVE_COUNT = 5
const DLQ_MESSAGE_RETENTION_PERIOD = 7 * 24 * 60 * 60 // 7 days in seconds
const VISIBILITY_TIMEOUT = 60 // 1 minutes
const HEARTBEAT_INTERVAL = 20 // 20 seconds
const MAX_RETRY_DURATION = 2 * 24 * 60 * 60 // 2 days in seconds

/** Maximum lengths for queue and topic names allowed, to ensure that AWS limits are not exceeded after applying prefixes. */
const MAX_QUEUE_NAME_LENGTH = 64 // AWS limit is 80, but we need to leave space for the prefix and -dlq suffix

export class MessageQueueToolkitSqsOptionsResolver {
  private readonly commandConfig: CommandConfig
  private readonly config: MessageQueueToolkitOptionsResolverConfig

  constructor(commandConfig: CommandConfig, config: MessageQueueToolkitOptionsResolverConfig) {
    this.commandConfig = groupByUnique(Object.values(commandConfig), 'queueName')
    this.config = config

    this.validateNamePatterns()
  }

  private validateNamePatterns(): void {
    if (!this.config.validateNamePatterns) return

    const queueNames = Object.values(this.commandConfig).flatMap((queue) => queue.queueName)
    for (const queueName of queueNames) {
      if (queueName.length > MAX_QUEUE_NAME_LENGTH) {
        throw new Error(
          `Queue name too long: ${queueName}. Max allowed length is ${MAX_QUEUE_NAME_LENGTH}, received ${queueName.length}`,
        )
      }
      if (!QUEUE_NAME_REGEX.test(queueName)) throw new Error(`Invalid queue name: ${queueName}`)
    }
  }

  resolveConsumerBuildOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    params: ResolveSqsConsumerBuildOptionsParams<MessagePayloadType>,
  ): ResolvedSqsConsumerBuildOptions<MessagePayloadType> {
    const resolvedQueue = this.resolveQueue(params)

    if (!resolvedQueue.createCommand) {
      throw new Error(`SQS Consumer can only be created for non-external queues`)
    }

    const handlerConfigs = params.handlers
    for (const handlerConfig of handlerConfigs) {
      const requestContextPreHandler = createRequestContextPreHandler(params.logger)
      handlerConfig.preHandlers.push(requestContextPreHandler)
    }

    return {
      creationConfig: resolvedQueue.createCommand,
      messageTypeField: MESSAGE_TYPE_FIELD,
      deletionConfig: { deleteIfExists: params.isTest },
      handlers: handlerConfigs,
      logMessages: params.logMessages,
      handlerSpy: params.isTest,
      concurrentConsumersAmount: params.concurrentConsumersAmount,
      maxRetryDuration: MAX_RETRY_DURATION,
      consumerOverrides: params.isTest
        ? {
            // allows to retry failed messages immediately
            terminateVisibilityTimeout: true,
            batchSize: params.batchSize,
          }
        : {
            heartbeatInterval: HEARTBEAT_INTERVAL,
            batchSize: params.batchSize,
          },
      deadLetterQueue: params.isTest
        ? undefined // no DLQ in test mode
        : {
            creationConfig: {
              queue: {
                QueueName: `${resolvedQueue.createCommand.queue.QueueName}${DLQ_SUFFIX}`,
                tags: resolvedQueue.createCommand.queue.tags,
                Attributes: {
                  KmsMasterKeyId: params.awsConfig.kmsKeyId,
                  MessageRetentionPeriod: DLQ_MESSAGE_RETENTION_PERIOD.toString(),
                },
              },
              updateAttributesIfExists: params.updateAttributesIfExists ?? true,
            },
            redrivePolicy: {
              maxReceiveCount: DLQ_MAX_RECEIVE_COUNT,
            },
          },
    }
  }

  private resolveQueue<MessagePayloadType extends ConsumerBaseMessageType>(
    params: ResolveSqsConsumerBuildOptionsParams<MessagePayloadType>,
  ): ResolvedQueueResult {
    const { queueName, awsConfig } = params

    const queueConfig = this.commandConfig[queueName]
    if (!queueConfig) throw new Error(`Queue ${queueName} not found`)

    if (queueConfig.isExternal) {
      return {
        locatorConfig: { queueName: applyAwsResourcePrefix(queueConfig.queueName, awsConfig) },
      }
    }

    return {
      createCommand: {
        queue: {
          QueueName: applyAwsResourcePrefix(queueConfig.queueName, awsConfig),
          tags: getSqsTags({ ...queueConfig, ...this.config }),
          Attributes: {
            KmsMasterKeyId: awsConfig.kmsKeyId,
            VisibilityTimeout: VISIBILITY_TIMEOUT.toString(),
          },
        },
        updateAttributesIfExists: params.updateAttributesIfExists ?? true,
        forceTagUpdate: params.forceTagUpdate,
      },
    }
  }
}
