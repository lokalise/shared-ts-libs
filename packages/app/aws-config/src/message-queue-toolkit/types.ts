import type { CommonLogger } from '@lokalise/node-core'
import type {
  CommonQueueOptions,
  ConsumerBaseMessageType,
  QueuePublisherOptions,
} from '@message-queue-toolkit/core'
import type { SNSPublisherOptions, SNSSQSConsumerOptions } from '@message-queue-toolkit/sns'
import type { SQSConsumerOptions } from '@message-queue-toolkit/sqs'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'

export type MessageQueueToolkitOptionsResolverConfig = Pick<
  AwsTagsParams,
  'appEnv' | 'system' | 'project'
> & {
  /** Enable validation of topic and queue names */
  validateNamePatterns?: boolean
}

type BaseParams = {
  /** AWS config object */
  awsConfig: AwsConfig
  /** Enable test mode */
  isTest?: boolean
  /** Update resources attributes if they exists (default: true)*/
  updateAttributesIfExists?: boolean
  /** In case of existing resources with different tags, update them*/
  forceTagUpdate?: boolean
} & Pick<CommonQueueOptions, 'logMessages'>

// ----------------------------------------
//                  SQS
// ----------------------------------------
type SqsBaseParams = BaseParams & {
  /** SQS queue name */
  queueName: string
}

type SqsPublisherOptions<MessagePayloadSchemas extends ConsumerBaseMessageType> =
  QueuePublisherOptions<
    // biome-ignore lint/suspicious/noExplicitAny: We don't care
    any,
    // biome-ignore lint/suspicious/noExplicitAny: We don't care
    any,
    MessagePayloadSchemas
  >

export type ResolveSqsPublisherBuildOptionsParams<
  MessagePayloadType extends ConsumerBaseMessageType,
> = SqsBaseParams & Pick<SqsPublisherOptions<MessagePayloadType>, 'messageSchemas'>

export type ResolvedSqsPublisherBuildOptions<MessagePayloadType extends ConsumerBaseMessageType> =
  Pick<
    SqsPublisherOptions<MessagePayloadType>,
    | 'locatorConfig'
    | 'creationConfig'
    | 'logMessages'
    | 'messageTypeField'
    | 'handlerSpy'
    | 'messageSchemas'
  >

type SqsConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType> = SQSConsumerOptions<
  MessagePayloadType,
  // biome-ignore lint/suspicious/noExplicitAny: We don't care
  any,
  // biome-ignore lint/suspicious/noExplicitAny: We don't care
  any
>

export type ResolveSqsConsumerBuildOptionsParams<
  MessagePayloadType extends ConsumerBaseMessageType,
> = SqsBaseParams &
  Pick<SqsConsumerOptions<MessagePayloadType>, 'handlers' | 'concurrentConsumersAmount'> & {
    /** logger */
    logger: CommonLogger
    /** The number of messages to request from SQS when polling */
    batchSize?: number
  }

export type ResolvedSqsConsumerBuildOptions<MessagePayloadType extends ConsumerBaseMessageType> =
  Pick<
    SqsConsumerOptions<MessagePayloadType>,
    | 'creationConfig'
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

// ----------------------------------------
//                  SNS
// ----------------------------------------
type SNSBaseParams = BaseParams & {
  /** SNS topic name */
  topicName: string
}

type SnsConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType> = SNSSQSConsumerOptions<
  MessagePayloadType,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any
>

export type ResolveSnsConsumerBuildOptionsParams<
  MessagePayloadType extends ConsumerBaseMessageType,
> = SNSBaseParams &
  Pick<SnsConsumerOptions<MessagePayloadType>, 'handlers' | 'concurrentConsumersAmount'> & {
    /** SQS queue name */
    queueName: string
    /** logger */
    logger: CommonLogger
    /** The number of messages to request from SQS when polling */
    batchSize?: number
  }

export type ResolvedSnsConsumerBuildOptions<MessagePayloadType extends ConsumerBaseMessageType> =
  Pick<
    SnsConsumerOptions<MessagePayloadType>,
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

export type ResolveSnsPublisherBuildOptionsParams<
  MessagePayloadType extends ConsumerBaseMessageType,
> = SNSBaseParams & Pick<SNSPublisherOptions<MessagePayloadType>, 'messageSchemas'>

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
