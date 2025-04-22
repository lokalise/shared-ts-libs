import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { QueueAttributeName } from '@aws-sdk/client-sqs'
import type { AwsTagsParams } from '../tags/index.ts'

export type MessageQueueToolkitSnsResolverOptions = {
  validateNamePatterns?: boolean
}

type BaseResolveParams = Pick<AwsTagsParams, 'appEnv' | 'system' | 'project'> & {
  topicName: string
  awsConfig: AwsConfig
  updateAttributesIfExists?: boolean
}

type ValidQueueAttributeNames = Exclude<QueueAttributeName, 'KmsMasterKeyId'>
export type ResolveConsumerBuildOptionsParams = BaseResolveParams & {
  queueName: string
  queueAttributes?: Partial<Record<ValidQueueAttributeNames, string>>
}
export type ResolvePublisherBuildOptionsParams = BaseResolveParams

export type ResolvedSnsConsumerBuildOptions = Pick<
  SNSSQSConsumerOptions<object, unknown, unknown>,
  'locatorConfig' | 'creationConfig'
>
export type ResolvedSnsPublisherBuildOptions = Pick<
  SNSPublisherOptions<object>,
  'locatorConfig' | 'creationConfig'
>
