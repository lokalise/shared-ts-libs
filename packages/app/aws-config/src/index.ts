export type {
  QueueConfig,
  TopicConfig,
  EventRoutingConfig,
} from './event-routing/eventRoutingConfig.ts'
export type {
  MessageQueueToolkitSnsOptionsResolverConfig,
  ResolvePublisherBuildOptionsParams,
  ResolveConsumerBuildOptionsParams,
  ResolvedSnsPublisherBuildOptions,
  ResolvedSnsConsumerBuildOptions,
} from './message-queue-toolkit/types.ts'
export { MessageQueueToolkitSnsOptionsResolver } from './message-queue-toolkit/MessageQueueToolkitSnsOptionsResolver.ts'
export type { RequestContextPreHandlerOutput } from './message-queue-toolkit/prehandlers/createRequestContextPreHandler.ts'
export * from './tags/index.ts'
export { getAwsConfig, type AwsConfig } from './awsConfig.ts'
export * from './applyAwsResourcePrefix.ts'
