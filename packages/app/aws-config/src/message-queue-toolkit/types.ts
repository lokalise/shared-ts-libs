import type { QueueAttributeName } from '@aws-sdk/client-sqs'
import type { CommonQueueOptions } from '@message-queue-toolkit/core'
import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'

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
} & Pick<CommonQueueOptions, 'messageTypeField' | 'logMessages'>

type ValidQueueAttributeNames = Exclude<QueueAttributeName, 'KmsMasterKeyId'>
export type ResolveConsumerBuildOptionsParams = BaseResolveOptionsParams & {
  queueName: string
  queueAttributes?: Partial<Record<ValidQueueAttributeNames, string>>
  /**
   * // TODO: complete the following list
   * handlers + request context prehandler
   * subscription + message type
   * maxRetryDuration
   * logMessages optional
   * isTest
   * DLQ
   */
}
export type ResolvePublisherBuildOptionsParams = BaseResolveOptionsParams &
  Pick<SNSPublisherOptions<object>, 'messageSchemas'>

export type ResolvedSnsConsumerBuildOptions = Pick<
  SNSSQSConsumerOptions<object, unknown, unknown>,
  'locatorConfig' | 'creationConfig' | 'logMessages' | 'messageTypeField' | 'handlerSpy'
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
