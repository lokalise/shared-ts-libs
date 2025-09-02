import { groupByUnique } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import type { SQSCreationConfig, SQSQueueLocatorType } from '@message-queue-toolkit/sqs'
import type { CommandConfig } from '../event-routing/eventRoutingConfig.ts'
import { AbstractMessageQueueToolkitOptionsResolver } from './AbstractMessageQueueToolkitOptionsResolver.js'
import type {
  MessageQueueToolkitOptionsResolverConfig,
  ResolveConsumerOptionsParams,
  ResolvedConsumerOptions,
  ResolvedPublisherOptions,
  ResolvePublisherOptionsParams,
} from './types.ts'

export class MessageQueueToolkitSqsOptionsResolver extends AbstractMessageQueueToolkitOptionsResolver {
  private readonly commandConfig: CommandConfig

  constructor(commandConfig: CommandConfig, config: MessageQueueToolkitOptionsResolverConfig) {
    super(config)
    this.commandConfig = groupByUnique(Object.values(commandConfig), 'queueName')

    this.validateQueueNames(Object.values(this.commandConfig).flatMap((queue) => queue.queueName))
  }

  public resolvePublisherOptions<MessagePayload extends ConsumerBaseMessageType>(
    queueName: string,
    params: ResolvePublisherOptionsParams<MessagePayload>,
  ): ResolvedPublisherOptions<SQSCreationConfig, SQSQueueLocatorType, MessagePayload> {
    const resolvedQueue = this.resolveQueue(queueName, this.commandConfig, params)

    return {
      creationConfig: resolvedQueue.creationConfig,
      locatorConfig: resolvedQueue.locatorConfig,
      ...this.commonPublisherOptions(params),
    }
  }

  resolveConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    queueName: string,
    params: ResolveConsumerOptionsParams<MessagePayloadType>,
  ): ResolvedConsumerOptions<SQSCreationConfig, SQSQueueLocatorType, MessagePayloadType> {
    const resolvedQueue = this.resolveQueue(queueName, this.commandConfig, params)

    return {
      creationConfig: resolvedQueue.creationConfig,
      locatorConfig: resolvedQueue.locatorConfig,
      ...this.commonConsumerOptions(params, resolvedQueue.creationConfig?.queue),
    }
  }
}
