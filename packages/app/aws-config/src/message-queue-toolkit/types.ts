import type { CommonLogger } from '@lokalise/node-core'
import type { MayOmit } from '@lokalise/universal-ts-utils/node'
import type { CommonQueueOptions, ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'

export type MessageQueueToolkitSnsOptionsResolverConfig = Pick<
  AwsTagsParams,
  'appEnv' | 'system' | 'project'
> & {
  /** Enable validation of topic and queue names */
  validateNamePatterns?: boolean
}

type BaseParams = {
  /** SNS topic name */
  topicName: string
  /** AWS config object */
  awsConfig: AwsConfig
  /** logger */
  logger: CommonLogger
  /** Enable test mode */
  isTest?: boolean
  /** Update resources attributes if they exists (default: true)*/
  updateAttributesIfExists?: boolean
  /** In case of existing resources with different tags, update them*/
  forceTagUpdate?: boolean
} & Pick<CommonQueueOptions, 'logMessages'> &
  MayOmit<CommonQueueOptions, 'messageTypeField'>

export type ResolveConsumerBuildOptionsParams = BaseParams &
  Pick<
    SNSSQSConsumerOptions<ConsumerBaseMessageType, unknown, unknown>,
    'handlers' | 'concurrentConsumersAmount'
  > & {
    /** SQS queue name */
    queueName: string
    /** The number of messages to request from SQS when polling */
    batchSize?: number
  }
export type ResolvePublisherBuildOptionsParams = BaseParams &
  Pick<SNSPublisherOptions<object>, 'messageSchemas'>

export type ResolvedSnsConsumerBuildOptions = Pick<
  SNSSQSConsumerOptions<ConsumerBaseMessageType, unknown, unknown>,
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
