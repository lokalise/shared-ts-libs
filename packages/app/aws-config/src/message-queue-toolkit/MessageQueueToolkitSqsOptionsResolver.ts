import { groupByUnique } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import type { SQSCreationConfig, SQSQueueLocatorType } from '@message-queue-toolkit/sqs'
import type { CommandConfig } from '../event-routing/eventRoutingConfig.ts'
import { AbstractMessageQueueToolkitSqsOptionsResolver } from './MessageQueueToolkitOptionsResolver.js'
import type {
  ConsumerBuildOptions,
  ConsumerBuildOptionsParams,
  MessageQueueToolkitOptionsResolverConfig,
  PublisherBuildOptions,
  PublisherBuildOptionsParams,
} from './types.ts'

export class MessageQueueToolkitSqsOptionsResolver extends AbstractMessageQueueToolkitSqsOptionsResolver {
  private readonly commandConfig: CommandConfig

  constructor(commandConfig: CommandConfig, config: MessageQueueToolkitOptionsResolverConfig) {
    super(config)
    this.commandConfig = groupByUnique(Object.values(commandConfig), 'queueName')

    this.validateQueueNames(Object.values(this.commandConfig).flatMap((queue) => queue.queueName))
  }

  public resolvePublisherOptions<MessagePayload extends ConsumerBaseMessageType>(
    queueName: string,
    params: PublisherBuildOptionsParams<MessagePayload>,
  ): PublisherBuildOptions<SQSCreationConfig, SQSQueueLocatorType, MessagePayload> {
    const resolvedQueue = this.resolveQueue(queueName, this.commandConfig, params)

    return {
      creationConfig: resolvedQueue.creationConfig,
      locatorConfig: resolvedQueue.locatorConfig,
      ...this.buildCommonPublisherConfig(params),
    }
  }

  resolveConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    queueName: string,
    params: ConsumerBuildOptionsParams<MessagePayloadType>,
  ): ConsumerBuildOptions<SQSCreationConfig, SQSQueueLocatorType, MessagePayloadType> {
    const resolvedQueue = this.resolveQueue(queueName, this.commandConfig, params)

    return {
      creationConfig: resolvedQueue.creationConfig,
      locatorConfig: resolvedQueue.locatorConfig,
      ...this.buildCommonConsumerConfig(params, resolvedQueue.creationConfig?.queue),
    }
  }
}
