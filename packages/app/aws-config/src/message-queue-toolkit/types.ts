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
import type { MqtResolverBaseParams } from './MessageQueueToolkitOptionsResolver.js'

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

export type PublisherBuildOptionsParams<MessagePayload extends ConsumerBaseMessageType> =
  BaseParams & Pick<QueuePublisherOptions<object, object, MessagePayload>, 'messageSchemas'>

export type PublisherBuildOptions<
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

export type ConsumerBuildOptionsParams<MessagePayload extends ConsumerBaseMessageType> =
  MqtResolverBaseParams &
    Pick<
      ConsumerOptions<SQSCreationConfig, object, MessagePayload>,
      'handlers' | 'concurrentConsumersAmount'
    > & {
      /** logger */
      logger: CommonLogger
      /** The number of messages to request from SQS when polling */
      batchSize?: number
    }

export type ConsumerBuildOptions<
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
