import { groupByUnique } from '@lokalise/universal-ts-utils/node'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { EventRoutingConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import { snsPrefixTransformer, sqsPrefixTransformer } from './prefixTransformer.ts'
import { QUEUE_NAME_REGEX, TOPIC_NAME_REGEX } from './regex.ts'
import type {
  MessageQueueToolkitSnsConsumerConnectionConfig,
  MessageQueueToolkitSnsResolveConsumerParams,
  MessageQueueToolkitSnsResolverOptions,
} from './types.ts'
import type { CreateQueueRequest } from '@aws-sdk/client-sqs'
import { getSqsTags } from '../tags/index.ts'

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

  getConsumerConnectionConfig(
    params: MessageQueueToolkitSnsResolveConsumerParams,
  ): MessageQueueToolkitSnsConsumerConnectionConfig {
    return {
      creationConfig: {
        queue: this.resolveQueueCreateRequest(params),
      },
    }
  }

  private resolveQueueCreateRequest = (
    params: MessageQueueToolkitSnsResolveConsumerParams,
  ): CreateQueueRequest => {
    const { topicName, queueName, awsConfig, queueAttributes } = params

    const topicConfig = this.routingConfig[topicName]
    const queueConfig = topicConfig?.queues[queueName]
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
