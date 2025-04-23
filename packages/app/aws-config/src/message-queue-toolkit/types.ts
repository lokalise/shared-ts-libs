import type { CommonQueueOptions } from '@message-queue-toolkit/core'
import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'
import type { MayOmit } from '@lokalise/universal-ts-utils/node'

export type MessageQueueToolkitSnsResolverOptions = Pick<
  AwsTagsParams,
  'appEnv' | 'system' | 'project'
> & {
  /** Enable validation of topic and queue names */
  validateNamePatterns?: boolean
}

type BaseResolveOptionsParams = {
  /** SNS topic name */
  topicName: string
  /** AWS config object */
  awsConfig: AwsConfig
  /** Enable test mode */
  isTest?: boolean
  /** Update resources attributes if they exists (default: true)*/
  updateAttributesIfExists?: boolean
  /** In case of existing resources with different tags, update them*/
  forceTagUpdate?: boolean
} & Pick<CommonQueueOptions, 'logMessages'> &
  MayOmit<CommonQueueOptions, 'messageTypeField'>

export type ResolveConsumerBuildOptionsParams = BaseResolveOptionsParams &
  Pick<
    SNSSQSConsumerOptions<object, unknown, unknown>,
    'handlers' | 'concurrentConsumersAmount'
  > & {
    /** SQS queue name */
    queueName: string
    /** The number of messages to request from SQS when polling */
    batchSize?: number
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
