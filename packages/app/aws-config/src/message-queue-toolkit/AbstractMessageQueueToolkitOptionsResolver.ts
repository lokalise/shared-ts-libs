import type { CreateQueueRequest } from '@aws-sdk/client-sqs'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import type { SQSCreationConfig, SQSQueueLocatorType } from '@message-queue-toolkit/sqs'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { QueueConfig } from '../event-routing/eventRoutingConfig.ts'
import { getSqsTags } from '../tags/index.ts'
import {
  DLQ_MAX_RECEIVE_COUNT,
  DLQ_MESSAGE_RETENTION_PERIOD,
  DLQ_SUFFIX,
  HEARTBEAT_INTERVAL,
  MAX_QUEUE_NAME_LENGTH,
  MAX_RETRY_DURATION,
  MESSAGE_TYPE_FIELD,
  VISIBILITY_TIMEOUT,
} from './constants.js'
import { createRequestContextPreHandler } from './prehandlers/createRequestContextPreHandler.js'
import type {
  MessageQueueToolkitOptionsResolverConfig,
  ResolveConsumerOptionsParams,
  ResolvedConsumerOptions,
  ResolvedPublisherOptions,
  ResolvePublisherOptionsParams,
} from './types.js'
import { QUEUE_NAME_REGEX } from './utils.ts'

type ResolvedQueueResult =
  | {
      locatorConfig: SQSQueueLocatorType
      creationConfig?: never
    }
  | {
      locatorConfig?: never
      creationConfig: SQSCreationConfig
    }

export abstract class AbstractMessageQueueToolkitOptionsResolver {
  protected readonly config: MessageQueueToolkitOptionsResolverConfig

  constructor(config: MessageQueueToolkitOptionsResolverConfig) {
    this.config = config
  }

  protected validateQueueNames(queueNames: string[]): void {
    if (!this.config.validateNamePatterns) return

    for (const queueName of queueNames) {
      if (queueName.length > MAX_QUEUE_NAME_LENGTH) {
        throw new Error(
          `Queue name too long: ${queueName}. Max allowed length is ${MAX_QUEUE_NAME_LENGTH}, received ${queueName.length}`,
        )
      }
      if (!QUEUE_NAME_REGEX.test(queueName)) {
        throw new Error(`Invalid queue name: ${queueName}`)
      }
    }
  }

  protected commonPublisherOptions<MessagePayload extends ConsumerBaseMessageType>(
    params: ResolvePublisherOptionsParams<MessagePayload>,
  ): Omit<
    ResolvedPublisherOptions<object, object, MessagePayload>,
    'creationConfig' | 'locatorConfig'
  > {
    return {
      handlerSpy: params.isTest,
      messageTypeField: MESSAGE_TYPE_FIELD,
      logMessages: params.logMessages,
      messageSchemas: params.messageSchemas,
    }
  }

  protected commonConsumerOptions<MessagePayload extends ConsumerBaseMessageType>(
    params: ResolveConsumerOptionsParams<MessagePayload>,
    createQueueRequest: CreateQueueRequest | undefined,
  ): Omit<
    ResolvedConsumerOptions<SQSCreationConfig, object, MessagePayload>,
    'creationConfig' | 'locatorConfig'
  > {
    const handlerConfigs = params.handlers
    for (const handlerConfig of handlerConfigs) {
      const requestContextPreHandler = createRequestContextPreHandler(params.logger)
      handlerConfig.preHandlers.push(requestContextPreHandler)
    }

    return {
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
      deadLetterQueue:
        !params.isTest && createQueueRequest
          ? {
              creationConfig: {
                queue: {
                  QueueName: `${createQueueRequest.QueueName}${DLQ_SUFFIX}`,
                  tags: createQueueRequest.tags,
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
            }
          : undefined,
    }
  }

  protected resolveQueue(
    queueName: string,
    queueConfigs: Record<string, QueueConfig>,
    // biome-ignore lint/suspicious/noExplicitAny: It is not important here
    params: ResolveConsumerOptionsParams<any> | ResolvePublisherOptionsParams<any>,
  ): ResolvedQueueResult {
    const queueConfig = queueConfigs[queueName]
    if (!queueConfig) throw new Error(`Queue ${queueName} not found`)

    const { awsConfig, updateAttributesIfExists, forceTagUpdate } = params

    if (queueConfig.isExternal) {
      return {
        locatorConfig: { queueName: applyAwsResourcePrefix(queueConfig.queueName, awsConfig) },
      }
    }

    return {
      creationConfig: {
        queue: {
          QueueName: applyAwsResourcePrefix(queueConfig.queueName, awsConfig),
          tags: getSqsTags({ ...queueConfig, ...this.config }),
          Attributes: {
            KmsMasterKeyId: awsConfig.kmsKeyId,
            VisibilityTimeout: VISIBILITY_TIMEOUT.toString(),
          },
        },
        updateAttributesIfExists: updateAttributesIfExists ?? true,
        forceTagUpdate: forceTagUpdate,
      },
    }
  }
}
