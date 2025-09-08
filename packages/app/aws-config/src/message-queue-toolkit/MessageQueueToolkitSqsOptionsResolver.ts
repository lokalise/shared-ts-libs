import { groupByUnique } from '@lokalise/universal-ts-utils/node'
import type { ConsumerBaseMessageType } from '@message-queue-toolkit/core'
import type { SQSCreationConfig, SQSQueueLocatorType } from '@message-queue-toolkit/sqs'
import type { CommandConfig } from '../event-routing/eventRoutingConfig.ts'
import { AbstractMessageQueueToolkitOptionsResolver } from './AbstractMessageQueueToolkitOptionsResolver.ts'
import type {
  MessageQueueToolkitOptionsResolverConfig,
  ResolveConsumerOptionsParams,
  ResolvedConsumerOptions,
  ResolvedPublisherOptions,
  ResolvePublisherOptionsParams,
} from './types.ts'

/**
 * Options resolver for MQT SQS lib.
 */
export class MessageQueueToolkitSqsOptionsResolver extends AbstractMessageQueueToolkitOptionsResolver {
  private readonly commandConfig: CommandConfig

  constructor(commandConfig: CommandConfig, config: MessageQueueToolkitOptionsResolverConfig) {
    super(config)
    this.commandConfig = groupByUnique(Object.values(commandConfig), 'queueName')

    this.validateQueueNames(Object.values(this.commandConfig).flatMap((queue) => queue.queueName))
  }

  /**
   * Resolves publisher options for an SQS queue.
   *
   * @template MessagePayload - The type of message payload being published
   * @param queueName - The name of the queue to publish to
   * @param params - Parameters containing AWS config, schemas, and other settings
   */
  public resolvePublisherOptions<MessagePayload extends ConsumerBaseMessageType>(
    queueName: string,
    params: ResolvePublisherOptionsParams<MessagePayload>,
  ): ResolvedPublisherOptions<SQSCreationConfig, SQSQueueLocatorType, MessagePayload> {
    const resolvedQueue = this.resolveQueue(queueName, this.commandConfig, params, true)

    return {
      creationConfig: resolvedQueue.creationConfig,
      locatorConfig: resolvedQueue.locatorConfig,
      ...this.commonPublisherOptions(params),
    }
  }

  /**
   * Resolves consumer options for an SQS queue.
   *
   * @template MessagePayloadType - The type of message payload being consumed
   * @param queueName - The name of the queue to consume from
   * @param params - Parameters containing AWS config, handlers, and other settings
   */
  resolveConsumerOptions<MessagePayloadType extends ConsumerBaseMessageType>(
    queueName: string,
    params: ResolveConsumerOptionsParams<MessagePayloadType>,
  ): ResolvedConsumerOptions<SQSCreationConfig, SQSQueueLocatorType, MessagePayloadType> {
    const resolvedQueue = this.resolveQueue(queueName, this.commandConfig, params, true)

    return {
      creationConfig: resolvedQueue.creationConfig,
      locatorConfig: resolvedQueue.locatorConfig,
      ...this.commonConsumerOptions(params, resolvedQueue.creationConfig?.queue),
    }
  }
}
