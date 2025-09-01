import type { CommonLogger } from '@lokalise/node-core'
import type {CommonQueueOptions, ConsumerBaseMessageType, QueuePublisherOptions} from '@message-queue-toolkit/core'
import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'

export type MessageQueueToolkitOptionsResolverConfig = Pick<
  AwsTagsParams,
  'appEnv' | 'system' | 'project'
> & {
  /** Enable validation of topic and queue names */
  validateNamePatterns?: boolean
}

type ConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType> = SNSSQSConsumerOptions<
  MessagePayloadType,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any
>

type BaseParams = {
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
} & Pick<CommonQueueOptions, 'logMessages'>

export type ResolveConsumerBuildOptionsParams<MessagePayloadType extends ConsumerBaseMessageType> =
  BaseParams &
    Pick<ConsumerOptions<MessagePayloadType>, 'handlers' | 'concurrentConsumersAmount'> & {
      /** SQS queue name */
      queueName: string
      /** logger */
      logger: CommonLogger
      /** The number of messages to request from SQS when polling */
      batchSize?: number
    }
export type ResolvePublisherBuildOptionsParams<MessagePayloadType extends ConsumerBaseMessageType> =
  BaseParams & Pick<SNSPublisherOptions<MessagePayloadType>, 'messageSchemas'>

export type ResolvedSnsConsumerBuildOptions<MessagePayloadType extends ConsumerBaseMessageType> =
  Pick<
    ConsumerOptions<MessagePayloadType>,
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
export type ResolvedSnsPublisherBuildOptions<MessagePayloadType extends ConsumerBaseMessageType> =
  Pick<
    SNSPublisherOptions<MessagePayloadType>,
    | 'locatorConfig'
    | 'creationConfig'
    | 'logMessages'
    | 'messageTypeField'
    | 'handlerSpy'
    | 'messageSchemas'
  >
