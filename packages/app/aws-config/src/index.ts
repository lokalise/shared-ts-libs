export * from './applyAwsResourcePrefix.ts'
export { type AwsConfig, getAwsConfig } from './awsConfig.ts'
export type {
  CommandConfig,
  EventRoutingConfig,
  QueueConfig,
  TopicConfig,
} from './event-routing/eventRoutingConfig.ts'
export * from './message-queue-toolkit/index.ts'
export * from './tags/index.ts'
