import type { CreateQueueRequest } from '@aws-sdk/client-sqs'
import {
  type ConsumerBaseMessageType,
  NO_TIMEOUT,
  type StartupResourcePollingConfig,
} from '@message-queue-toolkit/core'
import type {
  SQSCreationConfig,
  SQSPolicyConfig,
  SQSQueueLocatorType,
} from '@message-queue-toolkit/sqs'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { QueueConfig } from '../event-routing/eventRoutingConfig.ts'
import { getSqsTags } from '../tags/index.ts'
import {
  DLQ_MAX_RECEIVE_COUNT,
  DLQ_MESSAGE_RETENTION_PERIOD,
  DLQ_SUFFIX,
  HEARTBEAT_INTERVAL,
  MAX_RETRY_DURATION,
  MESSAGE_TYPE_PATH,
  VISIBILITY_TIMEOUT,
} from './constants.ts'
import { createRequestContextPreHandler } from './prehandlers/createRequestContextPreHandler.ts'
import type {
  MessageQueueToolkitOptionsResolverConfig,
  ResolveConsumerOptionsParams,
  ResolvedConsumerOptions,
  ResolvedPublisherOptions,
  ResolvePublisherOptionsParams,
} from './types.ts'

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

  protected commonPublisherOptions<MessagePayload extends ConsumerBaseMessageType>(
    params: ResolvePublisherOptionsParams<MessagePayload>,
  ): Omit<
    ResolvedPublisherOptions<object, object, MessagePayload>,
    'creationConfig' | 'locatorConfig'
  > {
    return {
      handlerSpy: params.isTest,
      messageTypeResolver: { messageTypePath: MESSAGE_TYPE_PATH },
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
      messageTypeResolver: { messageTypePath: MESSAGE_TYPE_PATH },
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
    policyConfig?: SQSPolicyConfig,
  ): ResolvedQueueResult {
    const queueConfig = queueConfigs[queueName]
    if (!queueConfig) throw new Error(`Queue ${queueName} not found`)

    const { awsConfig, updateAttributesIfExists, forceTagUpdate } = params

    if (queueConfig.isExternal) {
      return {
        locatorConfig: {
          queueName: applyAwsResourcePrefix(queueConfig.queueName, awsConfig),
          startupResourcePolling: this.resolveStartupResourcePolling(),
        },
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
        policyConfig,
        updateAttributesIfExists: updateAttributesIfExists ?? true,
        forceTagUpdate: forceTagUpdate ?? this.isDevelopmentEnvironment(),
      },
    }
  }

  protected isDevelopmentEnvironment(): boolean {
    return this.config.appEnv === 'development'
  }

  protected resolveStartupResourcePolling(): StartupResourcePollingConfig {
    const isDevelopment = this.isDevelopmentEnvironment()
    return {
      enabled: true,
      throwOnTimeout: false,
      nonBlocking: true,
      pollingIntervalMs: isDevelopment
        ? 5000 // 5 seconds
        : 30000, // 30 seconds
      timeoutMs: isDevelopment ? NO_TIMEOUT : 300000, // 5 minutes,
    }
  }
}
