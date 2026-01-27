import { generateWildcardSnsArn, generateWildcardSqsArn } from '@message-queue-toolkit/sqs'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { QueueConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import { MAX_QUEUE_NAME_LENGTH, MAX_TOPIC_NAME_LENGTH } from './constants.ts'

/**
 * Validates topic configurations to ensure they follow Lokalise naming conventions.
 *
 * This function performs the following validations on each topic:
 * - Topic name length does not exceed the maximum allowed length (246 characters)
 * - Topic name starts with the project name
 * - Topic name follows Lokalise guidelines
 * - All associated queues are valid
 *
 * Note: We temporarily allow topics with the pattern <project>_<moduleOrFlowName>. This won't be allowed in future versions.
 */
export const validateTopicsConfig = (topicsConfig: TopicConfig[], project: string): void => {
  for (const { topicName, isExternal, queues } of topicsConfig) {
    if (topicName.length > MAX_TOPIC_NAME_LENGTH) {
      throw new Error(
        `Topic name too long: ${topicName}. Max allowed length is ${MAX_TOPIC_NAME_LENGTH}, received ${topicName.length}`,
      )
    }

    if (!isExternal) {
      // only validate internal topics
      if (!topicName.startsWith(project)) {
        throw new Error(`Topic name must start with project name '${project}': ${topicName}`)
      }

      const topicNameWithoutProjectPrefix = topicName.replace(new RegExp(`^${project}`), '')
      if (!TOPIC_NAME_REGEX.test(topicNameWithoutProjectPrefix)) {
        throw new Error(`Invalid topic name: ${topicName}`)
      }
    }

    validateQueueConfig(Object.values(queues), project)
  }
}

/**
 * Validates queue configurations to ensure they follow Lokalise naming conventions.
 * This function performs the following validations on each queue:
 * - Queue name length does not exceed the maximum allowed length (64 characters)
 * - Queue name starts with the project name
 * - Queue name follows Lokalise guidelines
 */
export const validateQueueConfig = (queueConfigs: QueueConfig[], project: string): void => {
  for (const { queueName, isExternal } of queueConfigs) {
    if (queueName.length > MAX_QUEUE_NAME_LENGTH) {
      throw new Error(
        `Queue name too long: ${queueName}. Max allowed length is ${MAX_QUEUE_NAME_LENGTH}, received ${queueName.length}`,
      )
    }

    // For external queues, we only need to validate the length
    if (isExternal) continue

    if (!queueName.startsWith(project)) {
      throw new Error(`Queue name must start with project name '${project}': ${queueName}`)
    }

    const queueNameWithoutProjectPrefix = queueName.replace(new RegExp(`^${project}`), '')
    if (!QUEUE_NAME_REGEX.test(queueNameWithoutProjectPrefix)) {
      throw new Error(`Invalid queue name: ${queueName}`)
    }
  }
}

/**
 * Regex to validate that topic names are following Lokalise convention.
 * Full naming structure: {project}-{flow/entity}
 *
 * Note: Project name is validated separately and removed before applying this regex.
 * This regex only validates: (-|_){flow/entity}
 * Note: Should start with `-` but allowing `_` for backwards compatibility. This won't be allowed in future versions.
 *
 * Regex explanation (validates the part after removing the project prefix):
 * [-_]          -> Must start with hyphen or underscore (single character)
 * [a-z]+        -> One or more lowercase letters
 * (_[a-z]+)*    -> Zero or more groups of: underscore followed by one or more lowercase letters
 *
 * Valid examples (after removing project): `-module`, `-module_name`, `_flow_name`, `-user`
 */
const TOPIC_NAME_REGEX = /^[-_][a-z]+(_[a-z]+)*$/

/**
 * Regex to validate that queue names are following Lokalise convention.
 * Full naming structure: {project}-{flow/entity}(-{service})?(-{module})?
 * where service and module are optional (service not needed for single-service projects)
 *
 * Note: Project name is validated separately and removed before applying this regex.
 * This regex only validates: (-|_){flow/entity}(-{service})?(-{module})?
 * Note: Should start with `-` but allowing `_` for backwards compatibility. This won't be allowed in future versions.
 *
 * Regex explanation (validates the part after removing the project prefix):
 * [-_]                                                      -> Must start with hyphen or underscore (single character)
 * flow/entity: [a-z]+(_[a-z]+)*                            -> One or more lowercase letters, optionally separated by underscores (REQUIRED)
 * service:     (?:-[a-z]+(_[a-z]+)*)?                      -> Optional: hyphen + one or more lowercase letters, optionally separated by underscores
 * module:      (?:-[a-z]+(_[a-z]+)*)?                      -> Optional: hyphen + one or more lowercase letters, optionally separated by underscores
 *
 * Valid examples (after removing project): `-flow`, `-flow_name-service_name`, `-service-module`, `-user_service-handler-processor`, `_legacy-service`
 */
const QUEUE_NAME_REGEX = /^[-_][a-z]+(_[a-z]+)*(?:-[a-z]+(_[a-z]+)*(?:-[a-z]+(_[a-z]+)*)?)?$/

export const buildTopicArnsWithPublishPermissionsPrefix = (
  topicConfig: TopicConfig,
  awsConfig: AwsConfig,
): string => {
  return snsPrefixTransformer(applyAwsResourcePrefix(topicConfig.topicName, awsConfig))
}

export const buildQueueUrlsWithSubscribePermissionsPrefix = (
  topicConfig: TopicConfig,
  project: string,
  awsConfig: AwsConfig,
): string[] | undefined => {
  if (topicConfig.isExternal) return undefined

  return sqsPrefixTransformer(
    [project, ...(topicConfig.externalAppsWithSubscribePermissions ?? [])]
      .map((value) => applyAwsResourcePrefix(value, awsConfig))
      .map((value) => {
        if (value.endsWith('*')) return value
        return ensureWildcard(value.endsWith('-') ? value : `${value}-`)
      }),
  )
}

const snsPrefixTransformer = (value: string): string =>
  generateWildcardSnsArn(ensureWildcard(value))

const sqsPrefixTransformer = (value: string[]): string[] =>
  value.map((v) => generateWildcardSqsArn(ensureWildcard(v)))

const ensureWildcard = (value: string) => (value.endsWith('*') ? value : `${value}*`)
