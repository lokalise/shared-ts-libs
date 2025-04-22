import type { SNSTopicLocatorType, SNSSQSCreationConfig } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { QueueAttributeName } from '@aws-sdk/client-sqs'
import type { AwsTagsParams } from '../tags/index.ts'

export type MessageQueueToolkitSnsResolverOptions = {
  validateNamePatterns?: boolean
}

type MessageQueueToolkitSnsResolveCommonParams = Pick<
  AwsTagsParams,
  'appEnv' | 'system' | 'project'
> & {
  topicName: string
  awsConfig: AwsConfig
}

type ValidQueueAttributeNames = Exclude<QueueAttributeName, 'KmsMasterKeyId'>
export type MessageQueueToolkitSnsResolveConsumerParams =
  MessageQueueToolkitSnsResolveCommonParams & {
    queueName: string
    queueAttributes?: Partial<Record<ValidQueueAttributeNames, string>>
  }

export type MessageQueueToolkitSnsConsumerConnectionConfig = {
  locatorConfig?: SNSTopicLocatorType
  creationConfig: SNSSQSCreationConfig
}
