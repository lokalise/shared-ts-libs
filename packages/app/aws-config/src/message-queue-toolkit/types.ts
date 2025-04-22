import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { QueueAttributeName } from '@aws-sdk/client-sqs'
import type { AwsTagsParams } from '../tags/index.ts'

export type MessageQueueToolkitSnsResolverOptions = {
  validateNamePatterns?: boolean
}

type BaseResolveOptionsParams = Pick<AwsTagsParams, 'appEnv' | 'system' | 'project'> & {
  topicName: string
  awsConfig: AwsConfig
  isTest?: boolean
  updateAttributesIfExists?: boolean
  forceTagUpdate?: boolean
} & Pick<SNSPublisherOptions<object>, 'messageTypeField' | 'logMessages'> // TODO: use a different type to pick props

type ValidQueueAttributeNames = Exclude<QueueAttributeName, 'KmsMasterKeyId'>
export type ResolveConsumerBuildOptionsParams = BaseResolveOptionsParams & {
  queueName: string
  queueAttributes?: Partial<Record<ValidQueueAttributeNames, string>>
  /**
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
  'locatorConfig' | 'creationConfig'
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
