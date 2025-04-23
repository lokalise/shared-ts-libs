import type { QueueAttributeName } from '@aws-sdk/client-sqs'
import type { CommonQueueOptions } from '@message-queue-toolkit/core'
import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'
import type { MayOmit } from '@lokalise/universal-ts-utils/node'

export type MessageQueueToolkitSnsResolverOptions = Pick<
  AwsTagsParams,
  'appEnv' | 'system' | 'project'
> & {
  validateNamePatterns?: boolean
}

type BaseResolveOptionsParams = {
  topicName: string
  awsConfig: AwsConfig
  isTest?: boolean
  updateAttributesIfExists?: boolean
  forceTagUpdate?: boolean
} & Pick<CommonQueueOptions, 'logMessages'> &
  MayOmit<CommonQueueOptions, 'messageTypeField'>

type ValidQueueAttributeNames = Exclude<QueueAttributeName, 'KmsMasterKeyId'>
export type ResolveConsumerBuildOptionsParams = BaseResolveOptionsParams &
  Pick<
    SNSSQSConsumerOptions<object, unknown, unknown>,
    'handlers' | 'concurrentConsumersAmount' | 'maxRetryDuration'
  > & {
    queueName: string
    queueAttributes?: Partial<Record<ValidQueueAttributeNames, string>>
    heartbeatInterval?: number
    batchSize?: number
    dlqRedrivePolicyMaxReceiveCount?: number
    dlqMessageRetentionPeriod?: number
  }
export type ResolvePublisherBuildOptionsParams = BaseResolveOptionsParams &
  Pick<SNSPublisherOptions<object>, 'messageSchemas'>

export type ResolvedSnsConsumerBuildOptions = Pick<
  SNSSQSConsumerOptions<object, unknown, unknown>,
  | 'locatorConfig'
  | 'creationConfig'
  | 'subscriptionConfig'
  | 'deletionConfig'
  | 'handlers'
  | 'consumerOverrides'
  | 'deadLetterQueue'
  | 'maxRetryDuration'
  | 'concurrentConsumersAmount'
  | 'logMessages'
  | 'messageTypeField'
  | 'handlerSpy'
>
export type ResolvedSnsPublisherBuildOptions = Pick<
  SNSPublisherOptions<object>,
  | 'locatorConfig'
  | 'creationConfig'
  | 'logMessages'
  | 'messageTypeField'
  | 'handlerSpy'
  | 'messageSchemas'
>
