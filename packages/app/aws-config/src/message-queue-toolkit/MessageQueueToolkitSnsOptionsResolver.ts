import type { CreateTopicCommandInput } from '@aws-sdk/client-sns'
import type { CreateQueueRequest } from '@aws-sdk/client-sqs'
import { groupByUnique, type MayOmit } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import { generateFilterAttributes, type SNSTopicLocatorType } from '@message-queue-toolkit/sns'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { EventRoutingConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import { getSnsTags, getSqsTags } from '../tags/index.ts'
import { createRequestContextPreHandler } from './prehandlers/createRequestContextPreHandler.ts'
import type {
  MessageQueueToolkitSnsOptionsResolverConfig,
  ResolveConsumerBuildOptionsParams,
  ResolvedSnsConsumerBuildOptions,
  ResolvedSnsPublisherBuildOptions,
  ResolvePublisherBuildOptionsParams,
} from './types.ts'
import {
  buildQueueUrlsWithSubscribePermissionsPrefix,
  buildTopicArnsWithPublishPermissionsPrefix,
  QUEUE_NAME_REGEX,
  TOPIC_NAME_REGEX,
} from './utils.ts'

type ResolveTopicResult =
  | {
      locatorConfig: SNSTopicLocatorType
      createCommand?: never
    }
  | {
      locatorConfig?: never
      createCommand: CreateTopicCommandInput
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
const MAX_TOPIC_NAME_LENGTH = 246 // AWS limit is 256, but we need to leave space for the prefix

export class MessageQueueToolkitSnsOptionsResolver {
  private readonly routingConfig: EventRoutingConfig
  private readonly config: MessageQueueToolkitSnsOptionsResolverConfig

  constructor(
    routingConfig: EventRoutingConfig,
    config: MessageQueueToolkitSnsOptionsResolverConfig,
  ) {
    this.routingConfig = groupByUnique(
      Object.values(routingConfig).map((topic) => ({
        ...topic,
        queues: groupByUnique(Object.values(topic.queues), 'name'),
      })),
      'topicName',
    )
    this.config = config

    this.validateNamePatterns()
  }

  private validateNamePatterns(): void {
    if (!this.config.validateNamePatterns) return

    const topicNames = Object.keys(this.routingConfig)
    for (const topicName of topicNames) {
      if (topicName.length > MAX_TOPIC_NAME_LENGTH) {
        throw new Error(
          `Topic name too long: ${topicName}. Max allowed length is ${MAX_TOPIC_NAME_LENGTH}, received ${topicName.length}`,
        )
      }
      if (!TOPIC_NAME_REGEX.test(topicName)) throw new Error(`Invalid topic name: ${topicName}`)
    }

    const queueNames = Object.values(this.routingConfig).flatMap((topic) =>
      Object.keys(topic.queues),
    )
    for (const queueName of queueNames) {
      if (queueName.length > MAX_QUEUE_NAME_LENGTH) {
        throw new Error(
          `Queue name too long: ${queueName}. Max allowed length is ${MAX_QUEUE_NAME_LENGTH}, received ${queueName.length}`,
        )
      }
      if (!QUEUE_NAME_REGEX.test(queueName)) throw new Error(`Invalid queue name: ${queueName}`)
    }
  }

  public resolvePublisherBuildOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    params: ResolvePublisherBuildOptionsParams<MessagePayloadType>,
  ): ResolvedSnsPublisherBuildOptions<MessagePayloadType> {
    const topicConfig = this.getTopicConfig(params.topicName)
    const resolvedTopic = this.resolveTopic(this.getTopicConfig(params.topicName), params)

    return {
      locatorConfig: resolvedTopic.locatorConfig,
      creationConfig: resolvedTopic.createCommand
        ? {
            topic: resolvedTopic.createCommand,
            queueUrlsWithSubscribePermissionsPrefix: buildQueueUrlsWithSubscribePermissionsPrefix(
              topicConfig,
              params.awsConfig,
            ),
            allowedSourceOwner: params.awsConfig.allowedSourceOwner,
            updateAttributesIfExists: params.updateAttributesIfExists ?? true,
            forceTagUpdate: params.forceTagUpdate,
          }
        : undefined,
      handlerSpy: params.isTest,
      messageTypeField: MESSAGE_TYPE_FIELD,
      logMessages: params.logMessages,
      messageSchemas: params.messageSchemas,
    }
  }

  resolveConsumerBuildOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    params: ResolveConsumerBuildOptionsParams<MessagePayloadType>,
  ): ResolvedSnsConsumerBuildOptions<MessagePayloadType> {
    const topicConfig = this.getTopicConfig(params.topicName)
    const resolvedTopic = this.resolveTopic(topicConfig, params)

    const queueCreateRequest = this.resolveQueue(topicConfig, params)

    const handlerConfigs = params.handlers
    for (const handlerConfig of handlerConfigs) {
      const requestContextPreHandler = createRequestContextPreHandler(params.logger)
      handlerConfig.preHandlers.push(requestContextPreHandler)
    }

    return {
      locatorConfig: resolvedTopic.locatorConfig,
      creationConfig: {
        topic: resolvedTopic.createCommand,
        queue: queueCreateRequest,
        topicArnsWithPublishPermissionsPrefix: buildTopicArnsWithPublishPermissionsPrefix(
          topicConfig,
          params.awsConfig,
        ),
        queueUrlsWithSubscribePermissionsPrefix: buildQueueUrlsWithSubscribePermissionsPrefix(
          topicConfig,
          params.awsConfig,
        ),
        allowedSourceOwner: params.awsConfig.allowedSourceOwner,
        updateAttributesIfExists: params.updateAttributesIfExists ?? true,
        forceTagUpdate: params.forceTagUpdate,
      },
      messageTypeField: MESSAGE_TYPE_FIELD,
      subscriptionConfig: {
        updateAttributesIfExists: params.updateAttributesIfExists ?? true,
        Attributes: generateFilterAttributes(
          handlerConfigs.map((entry) => entry.schema),
          MESSAGE_TYPE_FIELD,
        ),
      },
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
            redrivePolicy: {
              maxReceiveCount: DLQ_MAX_RECEIVE_COUNT,
            },
            creationConfig: {
              queue: {
                QueueName: `${queueCreateRequest.QueueName}${DLQ_SUFFIX}`,
                tags: queueCreateRequest.tags,
                Attributes: {
                  KmsMasterKeyId: params.awsConfig.kmsKeyId,
                  MessageRetentionPeriod: DLQ_MESSAGE_RETENTION_PERIOD.toString(),
                },
              },
              updateAttributesIfExists: params.updateAttributesIfExists ?? true,
            },
          },
    }
  }

  private resolveTopic<MessagePayloadType extends ConsumerBaseMessageType>(
    topicConfig: TopicConfig,
    params: MayOmit<ResolvePublisherBuildOptionsParams<MessagePayloadType>, 'messageSchemas'>,
  ): ResolveTopicResult {
    if (topicConfig.isExternal) {
      return {
        locatorConfig: {
          topicName: applyAwsResourcePrefix(topicConfig.topicName, params.awsConfig),
        },
      }
    }

    return {
      createCommand: {
        Name: applyAwsResourcePrefix(topicConfig.topicName, params.awsConfig),
        Tags: getSnsTags({ ...topicConfig, ...this.config }),
        Attributes: { KmsMasterKeyId: params.awsConfig.kmsKeyId },
      },
    }
  }

  private resolveQueue<MessagePayloadType extends ConsumerBaseMessageType>(
    topicConfig: TopicConfig,
    params: ResolveConsumerBuildOptionsParams<MessagePayloadType>,
  ): CreateQueueRequest {
    const { queueName, awsConfig } = params

    const queueConfig = topicConfig.queues[queueName]
    if (!queueConfig) throw new Error(`Queue ${queueName} not found`)

    return {
      QueueName: applyAwsResourcePrefix(queueConfig.name, awsConfig),
      tags: getSqsTags({ ...queueConfig, ...this.config }),
      Attributes: {
        KmsMasterKeyId: awsConfig.kmsKeyId,
        VisibilityTimeout: VISIBILITY_TIMEOUT.toString(),
      },
    }
  }

  private getTopicConfig(topicName: string): TopicConfig {
    const topicConfig = this.routingConfig[topicName]
    if (!topicConfig) throw new Error(`Topic ${topicName} not found`)
    return topicConfig
  }
}
