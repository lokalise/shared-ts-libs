import { generateWildcardSnsArn, generateWildcardSqsArn } from '@message-queue-toolkit/sqs'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { TopicConfig } from '../event-routing/eventRoutingConfig.ts'

/**
 * Regex to validate that topics names are following Lokalise convention.
 * pattern: <system_name>-<(flow|model)_name>
 *
 * Regex explanation:
 *  System name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 *  - -> Hyphen
 *  Flow or model name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 */
export const TOPIC_NAME_REGEX = /^[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*$/

/**
 * Regex to validate that queue names are following Lokalise convention.
 * pattern: <system_name>-<(flow|model)_name>-<(service|module)_name>
 *
 * Regex explanation:
 * System name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 * - -> Hyphen
 * Flow or model name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 * - -> Hyphen
 * service or module name: [a-z]+(_[a-z]+)* -> One or more lowercase letters, optionally separated by underscores
 */
export const QUEUE_NAME_REGEX = /^[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*$/

export const buildTopicArnsWithPublishPermissionsPrefix = (
  topicConfig: TopicConfig,
  awsConfig: AwsConfig,
): string => {
  return snsPrefixTransformer(
    applyAwsResourcePrefix(`${extractAppNameFromTopic(topicConfig)}-`, awsConfig),
  )
}

export const buildQueueUrlsWithSubscribePermissionsPrefix = (
  topicConfig: TopicConfig,
  awsConfig: AwsConfig,
): string[] | undefined => {
  if (topicConfig.isExternal) return undefined

  const internalPermissions = extractAppNameFromTopic(topicConfig)
  const externalPermissions = topicConfig.externalAppsWithSubscribePermissions ?? []

  return sqsPrefixTransformer(
    [internalPermissions, ...externalPermissions]
      .map((value) => applyAwsResourcePrefix(value, awsConfig))
      .map((value) => {
        if (value.endsWith('*')) return value
        return ensureWildcard(value.endsWith('-') ? value : `${value}-`)
      }),
  )
}

const extractAppNameFromTopic = (topicConfig: TopicConfig): string => {
  const topicNameParts = topicConfig.topicName.split('-')
  if (!topicNameParts[0]?.trim().length) {
    throw new Error(`Invalid topic name ${topicConfig.topicName}`)
  }

  return topicNameParts[0]
}

const snsPrefixTransformer = (value: string): string =>
  generateWildcardSnsArn(ensureWildcard(value))

const sqsPrefixTransformer = (value: string[]): string[] =>
  value.map((v) => generateWildcardSqsArn(ensureWildcard(v)))

const ensureWildcard = (value: string) => (value.endsWith('*') ? value : `${value}*`)
