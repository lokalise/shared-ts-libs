import type { CommonLogger } from '@lokalise/node-core'
import type {
  CommonCreationConfigType,
  CommonQueueOptions,
  ConsumerBaseMessageType,
  QueuePublisherOptions,
} from '@message-queue-toolkit/core'
import type { SQSConsumerOptions, SQSCreationConfig } from '@message-queue-toolkit/sqs'
import type { AwsConfig } from '../awsConfig.ts'
import type { AwsTagsParams } from '../tags/index.ts'

/**
 * Configuration for the Message Queue Toolkit Options Resolver.
 */
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
  /** In case of existing resources with different tags, update them (default: false)*/
  forceTagUpdate?: boolean
} & Pick<CommonQueueOptions, 'logMessages'>

/**
 * Parameters for resolving publisher options for message queues.
 */
export type ResolvePublisherOptionsParams<MessagePayload extends ConsumerBaseMessageType> =
  BaseParams & Pick<QueuePublisherOptions<object, object, MessagePayload>, 'messageSchemas'>

/**
 * Resolved publisher options after processing through the option resolver.
 *
 * @template CreationConfig - The type of creation configuration (SQS, SNS, etc.)
 * @template LocatorConfig - The type of locator configuration for finding existing resources
 * @template MessagePayload - The type of message payload being published
 */
export type ResolvedPublisherOptions<
  CreationConfig extends CommonCreationConfigType,
  LocatorConfig extends object,
  MessagePayload extends ConsumerBaseMessageType,
> = Pick<
  QueuePublisherOptions<CreationConfig, LocatorConfig, MessagePayload>,
  | 'locatorConfig'
  | 'creationConfig'
  | 'logMessages'
  | 'messageTypeField'
  | 'handlerSpy'
  | 'messageSchemas'
>

/**
 * Consumer options type for SQS-based message consumers.
 *
 * @template CreationConfig - The SQS creation configuration type
 * @template LocatorConfig - The SQS locator configuration type
 * @template MessagePayload - The type of message payload being consumed
 */
type ConsumerOptions<
  CreationConfig extends SQSCreationConfig,
  LocatorConfig extends object,
  MessagePayload extends ConsumerBaseMessageType,
> = SQSConsumerOptions<
  MessagePayload,
  // biome-ignore lint/suspicious/noExplicitAny: We don't care
  any,
  // biome-ignore lint/suspicious/noExplicitAny: We don't care
  any,
  CreationConfig,
  LocatorConfig
>

/**
 * Parameters for resolving consumer options for message queues.
 *
 * @template MessagePayload - The type of message payload that will be consumed
 */
export type ResolveConsumerOptionsParams<MessagePayload extends ConsumerBaseMessageType> =
  BaseParams &
    Pick<
      ConsumerOptions<SQSCreationConfig, object, MessagePayload>,
      'handlers' | 'concurrentConsumersAmount'
    > & {
      /** logger */
      logger: CommonLogger
      /** The number of messages to request from SQS when polling */
      batchSize?: number
    }

/**
 * Resolved consumer options after processing through the options resolver.
 *
 * @template CreationConfig - The type of creation configuration (SQS, SNS, etc.)
 * @template LocatorConfig - The type of locator configuration for finding existing resources
 * @template MessagePayload - The type of message payload being consumed
 */
export type ResolvedConsumerOptions<
  CreationConfig extends SQSCreationConfig,
  LocatorConfig extends object,
  MessagePayload extends ConsumerBaseMessageType,
> = Pick<
  ConsumerOptions<CreationConfig, LocatorConfig, MessagePayload>,
  | 'creationConfig'
  | 'locatorConfig'
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
