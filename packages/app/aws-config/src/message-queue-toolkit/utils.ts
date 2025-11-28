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
 * - Topic name follows the pattern: `<project>-<moduleOrFlowName>`
 * - All associated queues are valid
 *
 * Note: We temporarily allow topics with the pattern <project>_<moduleOrFlowName>. This won't be allowed in future versions.
 */
export const validateTopicsConfig = (topicsConfig: TopicConfig[], project: string): void => {
  for (const { topicName, queues } of topicsConfig) {
    if (topicName.length > MAX_TOPIC_NAME_LENGTH) {
      throw new Error(
        `Topic name too long: ${topicName}. Max allowed length is ${MAX_TOPIC_NAME_LENGTH}, received ${topicName.length}`,
      )
    }

    if (!topicName.startsWith(project)) {
      throw new Error(`Topic name must start with project name '${project}': ${topicName}`)
    }

    const topicNameWithoutProjectPrefix = topicName.replace(new RegExp(`^${project}`), '')
    if (!TOPIC_NAME_REGEX_new.test(topicNameWithoutProjectPrefix)) {
      throw new Error(`Invalid topic name: ${topicName}`)
    }

    validateQueueConfig(Object.values(queues), project)
  }
}

/**
 * Validates queue configurations to ensure they follow Lokalise naming conventions.
 *
 * This function performs the following validations on each queue:
 * - Queue name length does not exceed the maximum allowed length (64 characters)
 * - Queue name starts with the project name
 * - Queue name follows the pattern: `<project>-<flow|model>_name-<service|module>_name(-<module_name>)?`
 */
export const validateQueueConfig = (queueConfigs: QueueConfig[], project: string): void => {
  for (const { queueName } of queueConfigs) {
    if (queueName.length > MAX_QUEUE_NAME_LENGTH) {
      throw new Error(
        `Queue name too long: ${queueName}. Max allowed length is ${MAX_QUEUE_NAME_LENGTH}, received ${queueName.length}`,
      )
    }

    if (!queueName.startsWith(project)) {
      throw new Error(`Queue name must start with project name '${project}': ${queueName}`)
    }

    const queueNameWithoutProjectPrefix = queueName.replace(new RegExp(`^${project}`), '')
    if (!QUEUE_NAME_REGEX_new.test(queueNameWithoutProjectPrefix)) {
      throw new Error(`Invalid queue name: ${queueName}`)
    }
  }
}

/**
 * Regex to validate that topics names are following Lokalise convention.
 * pattern: <(-|_)><moduleOrFlowName>
 *
 * Note: It should start with `-` but allowing `_` to support existing topics. This won't be allowed in future versions.
 * Note: Project name is validated separately. This regex validates the part after removing the project prefix.
 *
 * Regex explanation (validates the part after removing the project prefix):
 *  [-_]          -> Must start with a hyphen or underscore (single character)
 *  [a-z]+        -> One or more lowercase letters
 *  (_[a-z]+)*    -> Zero or more groups of: underscore followed by one or more lowercase letters
 *
 * Valid examples: `-module`, `-module_name`, `_flow_name`, `-user_service`
 * Invalid examples: `module_name` (missing separator), `-moduleName` (uppercase), `-module-name` (hyphen instead of underscore)
 */
const TOPIC_NAME_REGEX_new = /^[-_][a-z]+(_[a-z]+)*$/

/**
 * Regex to validate that queue names are following Lokalise convention.
 * pattern: -<flow|model>_name-<service|module>_name(-<module_name>)?
 *
 * Note: Project name is validated separately. This regex validates the part after removing the project prefix.
 *
 * Regex explanation (validates the part after removing the project prefix):
 * -                    -                       -> Must start with hyphen
 * flow or model name:  [a-z]+(_[a-z]+)*        -> One or more lowercase letters, optionally separated by underscores
 * -                    -                       -> Hyphen
 * service or module:   [a-z]+(_[a-z]+)*        -> One or more lowercase letters, optionally separated by underscores
 * module_name:         (?:-[a-z]+(_[a-z]+)*)?  -> Optional: hyphen followed by one or more lowercase letters, optionally separated by underscores
 *
 * Valid examples: `-flow_name-service_name`, `-service-module`, `-user_service-handler-processor`
 * Invalid examples: `flow-service` (missing initial hyphen), `-flow-Service` (uppercase), `-flow` (missing service segment)
 */
const QUEUE_NAME_REGEX_new = /^-[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*(?:-[a-z]+(_[a-z]+)*)?$/

export const buildTopicArnsWithPublishPermissionsPrefix = (
  project: string,
  awsConfig: AwsConfig,
): string => {
  return snsPrefixTransformer(
    applyAwsResourcePrefix(project.endsWith('-') ? project : `${project}-`, awsConfig),
  )
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
