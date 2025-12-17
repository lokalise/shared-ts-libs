import type { CreateTopicCommandInput } from '@aws-sdk/client-sns'
import { groupByUnique, type MayOmit } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import {
  generateFilterAttributes,
  type SNSCreationConfig,
  type SNSSQSConsumerOptions,
  type SNSSQSCreationConfig,
  type SNSSQSQueueLocatorType,
  type SNSTopicLocatorType,
} from '@message-queue-toolkit/sns'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { EventRoutingConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import { getSnsTags } from '../tags/index.ts'
import { AbstractMessageQueueToolkitOptionsResolver } from './AbstractMessageQueueToolkitOptionsResolver.ts'
import { MESSAGE_TYPE_PATH } from './constants.ts'
import type {
  MessageQueueToolkitOptionsResolverConfig,
  ResolveConsumerOptionsParams,
  ResolvedConsumerOptions,
  ResolvedPublisherOptions,
  ResolvePublisherOptionsParams,
} from './types.ts'
import {
  buildQueueUrlsWithSubscribePermissionsPrefix,
  buildTopicArnsWithPublishPermissionsPrefix,
  validateTopicsConfig,
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

/**
 * Resolved SNS consumer options.
 *
 * @template MessagePayload - The type of message payload being consumed
 */
export type ResolvedSnsConsumerOptions<MessagePayload extends ConsumerBaseMessageType> =
  ResolvedConsumerOptions<SNSSQSCreationConfig, SNSSQSQueueLocatorType, MessagePayload> &
    Pick<SNSSQSConsumerOptions<MessagePayload, object, object>, 'subscriptionConfig'>

/**
 * Options resolver for MQT SNS lib.
 */
export class MessageQueueToolkitSnsOptionsResolver extends AbstractMessageQueueToolkitOptionsResolver {
  private readonly routingConfig: EventRoutingConfig

  constructor(routingConfig: EventRoutingConfig, config: MessageQueueToolkitOptionsResolverConfig) {
    super(config)
    if (config.validateNamePatterns) {
      validateTopicsConfig(Object.values(routingConfig), config.project)
    }

    this.routingConfig = groupByUnique(
      Object.values(routingConfig).map((topic) => ({
        ...topic,
        queues: groupByUnique(Object.values(topic.queues), 'queueName'),
      })),
      'topicName',
    )
  }

  /**
   * Resolves publisher options for an SNS topic.
   *
   * @template MessagePayload - The type of message payload being published
   * @param topicName - The name of the topic to publish to
   * @param params - Parameters containing AWS config, schemas, and other settings
   * @returns Resolved publisher options for the SNS topic
   */
  public resolvePublisherOptions<MessagePayload extends ConsumerBaseMessageType>(
    topicName: string,
    params: ResolvePublisherOptionsParams<MessagePayload>,
  ): ResolvedPublisherOptions<SNSCreationConfig, SNSTopicLocatorType, MessagePayload> {
    const topicConfig = this.getTopicConfig(topicName)
    const resolvedTopic = this.resolveTopic(topicConfig, params)

    return {
      locatorConfig: resolvedTopic.locatorConfig,
      creationConfig: resolvedTopic.createCommand
        ? {
            topic: resolvedTopic.createCommand,
            queueUrlsWithSubscribePermissionsPrefix: buildQueueUrlsWithSubscribePermissionsPrefix(
              topicConfig,
              this.config.project,
              params.awsConfig,
            ),
            allowedSourceOwner: params.awsConfig.allowedSourceOwner,
            updateAttributesIfExists: params.updateAttributesIfExists ?? true,
            forceTagUpdate: params.forceTagUpdate,
          }
        : undefined,
      ...this.commonPublisherOptions(params),
    }
  }

  /**
   * Resolves consumer options for an SNS topic and its associated SQS queue.
   *
   * @template MessagePayload - The type of message payload being consumed
   * @param topicName - The name of the SNS topic to subscribe to
   * @param queueName - The name of the SQS queue to consume from
   * @param params - Parameters containing AWS config, handlers, and other settings
   */
  resolveConsumerOptions<MessagePayload extends ConsumerBaseMessageType>(
    topicName: string,
    queueName: string,
    params: ResolveConsumerOptionsParams<MessagePayload>,
  ): ResolvedSnsConsumerOptions<MessagePayload> {
    const topicConfig = this.getTopicConfig(topicName)
    const resolvedTopic = this.resolveTopic(topicConfig, params)

    const { creationConfig: queueCreationConfig } = this.resolveQueue(
      queueName,
      topicConfig.queues,
      params,
    )

    /* v8 ignore start */
    if (!queueCreationConfig) {
      // This should not happen due to typing, but just in case
      throw new Error(`Queue configuration for ${queueName} should not be external`)
    }
    /* v8 ignore stop */

    const options = this.commonConsumerOptions(params, queueCreationConfig.queue)

    return {
      locatorConfig: resolvedTopic.locatorConfig,
      creationConfig: {
        topic: resolvedTopic.createCommand,
        queue: queueCreationConfig.queue,
        topicArnsWithPublishPermissionsPrefix: buildTopicArnsWithPublishPermissionsPrefix(
          this.config.project,
          params.awsConfig,
        ),
        queueUrlsWithSubscribePermissionsPrefix: buildQueueUrlsWithSubscribePermissionsPrefix(
          topicConfig,
          this.config.project,
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
          MESSAGE_TYPE_PATH,
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
    params: MayOmit<ResolvePublisherOptionsParams<MessagePayloadType>, 'messageSchemas'>,
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
