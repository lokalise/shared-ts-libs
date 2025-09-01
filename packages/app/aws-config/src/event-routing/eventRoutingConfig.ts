import type { AwsTagsParams } from '../tags/index.ts'

/**
 * Within the same service, we can have topics and queues owned by different teams and services (in case of monorepos).
 * The rest of the config is shared between all topics and queues.
 */
type CommonConfig<Owner extends string, Service extends string> = Pick<
  AwsTagsParams<string, Owner, string, Service>,
  'owner' | 'service'
>
/**
 * Configuration for an external SQS queue.
 * External queues are managed outside your application and your app should only locate them.
 */
export type ExternalQueueConfig = {
  /** The name of the SQS queue */
  name: string
  /** Marks this as an external topic. */
  isExternal: true
}

/**
 * Configuration for an internal SQS queue.
 * Internal queues are managed and created by your application.
 *
 * @template Owner - The type representing the owner or team name.
 * @template Service - The type representing the service name.
 */
export type InternalQueueConfig<Owner extends string = string, Service extends string = string> = {
  /** The name of the SQS queue */
  name: string
  /** Should not be present in internal queues */
  isExternal?: never
} & CommonConfig<Owner, Service>

/**
 * Configuration for an SQS queue. This is a union type that can be either an internal or external queue configuration.
 * Supports both internal (managed within your application)
 * and external (managed outside your control) queues.
 *
 * There are two modes for this config:
 * 1. Internal queue (default): These queues are supposed to be managed and created by your application.
 * 2. External queue: Minimal config indicating only the queue name and that it is external,
 *  these queues are supposed to be created and managed by another application, your app should only locate them.
 *
 * @template Owner - The type representing the owner or team name (defaults to string).
 * @template Service - The type representing the service name (defaults to string).
 */
export type QueueConfig<Owner extends string = string, Service extends string = string> =
  | ExternalQueueConfig
  | InternalQueueConfig<Owner, Service>

/**
 * Configuration for routing command messages to SQS queues.
 *
 * This type maps command names (as string keys) to their corresponding queue configuration.
 * Each entry can be either an internal queue or an external queue.

 * Use this type to define which queues should receive specific command messages.
 *
 * @template Owner - The type representing the owner or team name (defaults to string).
 * @template Service - The type representing the service name (defaults to string).
 */
export type CommandConfig<Owner extends string = string, Service extends string = string> = Record<
  string,
  QueueConfig<Owner, Service>
>

/**
 * Configuration for an SNS topic and its associated queues.
 * Supports both internal and external topics.
 *
 * There are two modes for this config:
 * 1. Internal Topic (default): Includes full config and the set of external apps with subscribe permissions,
 *  these topics are supposed to be managed and created by your application.
 * 2. External Topic: Minimal config indicating only the topic name and that it is external,
 *  these topics are supposed to be created and managed by another application, our app should only locate them.
 *
 * @template Owner - The type representing the owner/team name.
 * @template Service - The type representing the service name.
 * @template ExternalApp - The type representing external apps with subscribe permissions.
 */
export type TopicConfig<
  Owner extends string = string,
  Service extends string = string,
  ExternalApp extends string = string,
> = {
  /** The name of the SNS topic */
  topicName: string
  /** A mapping of queue names to their configuration for queues subscribed to this topic */
  queues: Record<string, InternalQueueConfig<Owner, Service>>
} & (
  | /** Internal topic */
  (CommonConfig<Owner, Service> & {
      /** Should not be present in internal topics */
      isExternal?: never
      /** List of external applications allowed to subscribe to this topic. Leave undefined if only current apps are allowed */
      externalAppsWithSubscribePermissions?: ExternalApp[]
    })
  | /** External topic*/ {
      /** Marks this as an external topic. */
      isExternal: true
      /** Should not be present in external topics */
      owner?: never
      /** Should not be present in external topics */
      service?: never
      /** Should not be present in external topics */
      externalAppsWithSubscribePermissions?: never
    }
)

/**
 * Configuration for event routing across SNS topics and SQS queues.
 * This is the top-level configuration that maps topic names to their configurations.
 *
 * Each topic can be either internal (managed by your application) or external (managed outside your application).
 * Topics contain queues that subscribe to them for message processing.
 *
 * Use this type to define which topics and queues participate in your event-driven architecture,
 * specifying how events are published and which queues process them.
 *
 * @template Owner - The type representing the owner or team name.
 * @template Service - The type representing the service name.
 * @template ExternalApp - The type representing external apps with subscribed permissions.
 */
export type EventRoutingConfig<
  Owner extends string = string,
  Service extends string = string,
  ExternalApp extends string = string,
> = Record<string, TopicConfig<Owner, Service, ExternalApp>>
