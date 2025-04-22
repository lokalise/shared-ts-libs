import { groupByUnique } from '@lokalise/universal-ts-utils/node'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { EventRoutingConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import { snsPrefixTransformer, sqsPrefixTransformer } from './prefixTransformer.ts'
import { QUEUE_NAME_REGEX, TOPIC_NAME_REGEX } from './regex.ts'
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

  constructor(routingConfig: EventRoutingConfig, options?: MessageQueueToolkitSnsResolverOptions) {
    this.routingConfig = groupByUnique(
      Object.values(routingConfig).map((topic) => ({
        ...topic,
        queues: groupByUnique(Object.values(topic.queues), 'name'),
      })),
      'topicName',
    )
    if (options?.validateNamePatterns) this.validateNamePatterns()
  }

  private validateNamePatterns(): void {
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

  private getTopicConfig(topicName: string): TopicConfig {
    const topicConfig = this.routingConfig[topicName]
    if (!topicConfig) throw new Error(`Topic ${topicName} not found`)
    return topicConfig
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
        topicArnsWithPublishPermissionsPrefix: this.buildTopicArnsWithPublishPermissionsPrefix(
          topicConfig,
          params.awsConfig,
        ),
        queueUrlsWithSubscribePermissionsPrefix: this.buildQueueUrlsWithSubscribePermissionsPrefix(
          topicConfig,
          params.awsConfig,
        ),
        allowedSourceOwner: params.awsConfig.allowedSourceOwner,
        updateAttributesIfExists: params.updateAttributesIfExists ?? false,
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
            queueUrlsWithSubscribePermissionsPrefix:
              this.buildQueueUrlsWithSubscribePermissionsPrefix(topicConfig, params.awsConfig),
            allowedSourceOwner: params.awsConfig.allowedSourceOwner,
            updateAttributesIfExists: params.updateAttributesIfExists,
          }
        : undefined,
    }
  }

  private resolveTopic(
    topicConfig: TopicConfig,
    params: ResolvePublisherBuildOptionsParams,
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
        Tags: getSnsTags({ ...topicConfig, ...params }),
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
      tags: getSqsTags({ ...queueConfig, ...params }),
      Attributes: { ...queueAttributes, KmsMasterKeyId: awsConfig.kmsKeyId },
    }
  }

  private buildTopicArnsWithPublishPermissionsPrefix(
    topicConfig: TopicConfig,
    awsConfig: AwsConfig,
  ) {
    return snsPrefixTransformer(
      applyAwsResourcePrefix(`${this.extractAppNameFromTopic(topicConfig)}-`, awsConfig),
    )
  }

  private buildQueueUrlsWithSubscribePermissionsPrefix(
    topicConfig: TopicConfig,
    awsConfig: AwsConfig,
  ): string[] | undefined {
    if (topicConfig.isExternal) return undefined

    const internalPermissions = `${this.extractAppNameFromTopic(topicConfig)}-*`
    const externalPermissions = topicConfig.externalAppsWithSubscribePermissions ?? []

    return sqsPrefixTransformer(
      [internalPermissions, ...externalPermissions].map((value) =>
        applyAwsResourcePrefix(value, awsConfig),
      ),
    )
  }

  private extractAppNameFromTopic(topicConfig: TopicConfig): string {
    const topicNameParts = topicConfig.topicName.split('-')
    if (!topicNameParts[0]) throw new Error(`Invalid topic name ${topicConfig.topicName}`)
    return topicNameParts[0]
  }
}
