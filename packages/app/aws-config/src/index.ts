export * from './applyAwsResourcePrefix.ts'
export { type AwsConfig, getAwsConfig } from './awsConfig.ts'
export type {
  EventRoutingConfig,
  QueueConfig,
  TopicConfig,
} from './event-routing/eventRoutingConfig.ts'
export { MessageQueueToolkitSnsOptionsResolver } from './message-queue-toolkit/MessageQueueToolkitSnsOptionsResolver.ts'
export type { RequestContextPreHandlerOutput } from './message-queue-toolkit/prehandlers/createRequestContextPreHandler.ts'
export type {
  MessageQueueToolkitSnsOptionsResolverConfig,
  ResolveConsumerBuildOptionsParams,
  ResolvedSnsConsumerBuildOptions,
  ResolvedSnsPublisherBuildOptions,
  ResolvePublisherBuildOptionsParams,
} from './message-queue-toolkit/types.ts'
export * from './tags/index.ts'
