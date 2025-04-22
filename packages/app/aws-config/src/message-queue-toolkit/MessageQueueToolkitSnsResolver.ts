import { groupByUnique, type MayOmit } from '@lokalise/universal-ts-utils/node'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { EventRoutingConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import type {
  MessageQueueToolkitSnsResolverOptions,
  ResolveConsumerBuildOptionsParams,
  ResolvedSnsConsumerBuildOptions,
  ResolvedSnsPublisherBuildOptions,
  ResolvePublisherBuildOptionsParams,
} from './types.ts'
import type { CreateQueueRequest } from '@aws-sdk/client-sqs'
import { getSnsTags, getSqsTags } from '../tags/index.ts'
import type { SNSTopicLocatorType } from '@message-queue-toolkit/sns'
import type { CreateTopicCommandInput } from '@aws-sdk/client-sns'
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

export class MessageQueueToolkitSnsResolver {
  private readonly routingConfig: EventRoutingConfig
  private readonly options: MessageQueueToolkitSnsResolverOptions

  constructor(routingConfig: EventRoutingConfig, options: MessageQueueToolkitSnsResolverOptions) {
    this.routingConfig = groupByUnique(
      Object.values(routingConfig).map((topic) => ({
        ...topic,
        queues: groupByUnique(Object.values(topic.queues), 'name'),
      })),
      'topicName',
    )
    this.options = options

    this.validateNamePatterns()
  }

  private validateNamePatterns(): void {
    if (!this.options.validateNamePatterns) return

    const topicNames = Object.keys(this.routingConfig)
    for (const topicName of topicNames) {
      if (!TOPIC_NAME_REGEX.test(topicName)) throw new Error(`Invalid topic name: ${topicName}`)
    }

    const queueNames = Object.values(this.routingConfig).flatMap((topic) =>
      Object.keys(topic.queues),
    )
    for (const queueName of queueNames) {
      if (!QUEUE_NAME_REGEX.test(queueName)) throw new Error(`Invalid queue name: ${queueName}`)
    }
  }

  resolveConsumerBuildOptions(
    params: ResolveConsumerBuildOptionsParams,
  ): ResolvedSnsConsumerBuildOptions {
    const topicConfig = this.getTopicConfig(params.topicName)
    const resolvedTopic = this.resolveTopic(topicConfig, params)

    return {
      locatorConfig: resolvedTopic.locatorConfig,
      creationConfig: {
        topic: resolvedTopic.createCommand,
        queue: this.resolveQueue(topicConfig, params),
        topicArnsWithPublishPermissionsPrefix: buildTopicArnsWithPublishPermissionsPrefix(
          topicConfig,
          params.awsConfig,
        ),
        queueUrlsWithSubscribePermissionsPrefix: buildQueueUrlsWithSubscribePermissionsPrefix(
          topicConfig,
          params.awsConfig,
        ),
        allowedSourceOwner: params.awsConfig.allowedSourceOwner,
        updateAttributesIfExists: params.updateAttributesIfExists,
        forceTagUpdate: params.forceTagUpdate,
      },
    }
  }

  resolvePublisherBuildOptions(
    params: ResolvePublisherBuildOptionsParams,
  ): ResolvedSnsPublisherBuildOptions {
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
            updateAttributesIfExists: params.updateAttributesIfExists,
            forceTagUpdate: params.forceTagUpdate,
          }
        : undefined,
      handlerSpy: params.isTest,
      messageTypeField: params.messageTypeField,
      logMessages: params.logMessages,
      messageSchemas: params.messageSchemas,
    }
  }

  private resolveTopic(
    topicConfig: TopicConfig,
    params: MayOmit<ResolvePublisherBuildOptionsParams, 'messageSchemas'>,
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
        Tags: getSnsTags({ ...topicConfig, ...this.options }),
        Attributes: { KmsMasterKeyId: params.awsConfig.kmsKeyId },
      },
    }
  }

  private resolveQueue = (
    topicConfig: TopicConfig,
    params: ResolveConsumerBuildOptionsParams,
  ): CreateQueueRequest => {
    const { queueName, awsConfig, queueAttributes } = params

    const queueConfig = topicConfig.queues[queueName]
    if (!queueConfig) throw new Error(`Queue ${queueName} not found`)

    return {
      QueueName: applyAwsResourcePrefix(queueConfig.name, awsConfig),
      tags: getSqsTags({ ...queueConfig, ...this.options }),
      Attributes: { ...queueAttributes, KmsMasterKeyId: awsConfig.kmsKeyId },
    }
  }

  private getTopicConfig(topicName: string): TopicConfig {
    const topicConfig = this.routingConfig[topicName]
    if (!topicConfig) throw new Error(`Topic ${topicName} not found`)
    return topicConfig
  }
}
