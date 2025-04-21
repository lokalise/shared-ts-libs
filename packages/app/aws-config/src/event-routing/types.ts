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
 * Configuration for a single SQS queue, including its name and shared metadata.
 *
 * @template Owner - The type representing the owner or team name (defaults to string).
 * @template Service - The type representing the service name (defaults to string).
 */
export type QueueConfig<
  Owner extends string = string,
  Service extends string = string,
> = CommonConfig<Owner, Service> & {
  /** The name of the SQS queue */
  name: string
}

/**
 * Configuration for an SNS topic and its associated queues.
 * Supports both internal (managed within your application) and external (managed outside your control) topics.
 *
 * There are two modes for this config:
 * 1. Internal Topic (default): Includes full config and the set of external apps with subscribe permissions.
 * 2. External Topic: Minimal config indicating only the topic name and that it is external.
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
  queues: Record<string, CommonConfig<Owner, Service>>
} & (
  | /** Internal topic */
  (CommonConfig<Owner, Service> & {
      /** Should not be present in internal topics */
      isExternal?: never
      /** List of external applications allowed to subscribe to this topic. Leave undefined if only current apps is allowed */
      externalAppsWithSubscribePermissions?: ExternalApp[]
    })
  | /** External topic*/ {
      /** Marks this as an external topic. */
      isExternal: true
      /** Should not be present in external topics */
      ownerTeam?: never
      /** Should not be present in external topics */
      serviceName?: never
      /** Should not be present in external topics */
      externalAppsWithSubscribePermissions?: never
    }
)

export type EventRoutingConfig = Record<string, TopicConfig>
