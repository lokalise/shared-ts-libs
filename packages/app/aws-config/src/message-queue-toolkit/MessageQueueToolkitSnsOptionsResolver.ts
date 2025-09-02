import type { CreateTopicCommandInput } from '@aws-sdk/client-sns'
import { groupByUnique, type MayOmit } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import {
  generateFilterAttributes,
  type SNSCreationConfig,
  type SNSSQSCreationConfig,
  type SNSSQSQueueLocatorType,
  type SNSTopicLocatorType,
} from '@message-queue-toolkit/sns'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { EventRoutingConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import { getSnsTags } from '../tags/index.ts'
import { MAX_TOPIC_NAME_LENGTH, MESSAGE_TYPE_FIELD } from './constants.js'
import { AbstractMessageQueueToolkitSqsOptionsResolver } from './MessageQueueToolkitOptionsResolver.js'
import type {
  ConsumerBuildOptions,
  ConsumerBuildOptionsParams,
  MessageQueueToolkitOptionsResolverConfig,
  PublisherBuildOptions,
  PublisherBuildOptionsParams,
} from './types.ts'
import {
  buildQueueUrlsWithSubscribePermissionsPrefix,
  buildTopicArnsWithPublishPermissionsPrefix,
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

export class MessageQueueToolkitSnsOptionsResolver extends AbstractMessageQueueToolkitSqsOptionsResolver {
  private readonly routingConfig: EventRoutingConfig

  constructor(routingConfig: EventRoutingConfig, config: MessageQueueToolkitOptionsResolverConfig) {
    super(config)
    this.routingConfig = groupByUnique(
      Object.values(routingConfig).map((topic) => ({
        ...topic,
        queues: groupByUnique(Object.values(topic.queues), 'queueName'),
      })),
      'topicName',
    )
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

    this.validateQueueNames(
      Object.values(this.routingConfig).flatMap(({ queues }) =>
        Object.values(queues).map((queue) => queue.queueName),
      ),
    )
  }

  public resolvePublisherOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    topicName: string,
    params: PublisherBuildOptionsParams<MessagePayloadType>,
  ): PublisherBuildOptions<SNSCreationConfig, SNSTopicLocatorType, MessagePayloadType> {
    const topicConfig = this.getTopicConfig(topicName)
    const resolvedTopic = this.resolveTopic(topicConfig, params)

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
      ...this.buildCommonPublisherConfig(params),
    }
  }

  resolveConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    topicName: string,
    queueName: string,
    params: ConsumerBuildOptionsParams<MessagePayloadType>,
  ): ConsumerBuildOptions<SNSSQSCreationConfig, SNSSQSQueueLocatorType, MessagePayloadType> & {
    subscriptionConfig: object
  } {
    const topicConfig = this.getTopicConfig(topicName)
    const resolvedTopic = this.resolveTopic(topicConfig, params)

    const { creationConfig: queueCreationConfig } = this.resolveQueue(
      queueName,
      topicConfig.queues,
      params,
    )
    if (!queueCreationConfig) {
      // This should not happen due to typing, but just in case
      throw new Error(`Queue configuration for ${queueName} should not be external`)
    }

    const options = this.buildCommonConsumerConfig(params, queueCreationConfig.queue)

    return {
      locatorConfig: resolvedTopic.locatorConfig,
      creationConfig: {
        topic: resolvedTopic.createCommand,
        queue: queueCreationConfig.queue,
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
      subscriptionConfig: {
        updateAttributesIfExists: params.updateAttributesIfExists ?? true,
        Attributes: generateFilterAttributes(
          options.handlers.map((entry) => entry.schema),
          MESSAGE_TYPE_FIELD,
        ),
      },
      ...options,
    }
  }

  private getTopicConfig(topicName: string): TopicConfig {
    const topicConfig = this.routingConfig[topicName]
    if (!topicConfig) throw new Error(`Topic ${topicName} not found`)
    return topicConfig
  }

  private resolveTopic<MessagePayloadType extends ConsumerBaseMessageType>(
    topicConfig: TopicConfig,
    params: MayOmit<PublisherBuildOptionsParams<MessagePayloadType>, 'messageSchemas'>,
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
}
