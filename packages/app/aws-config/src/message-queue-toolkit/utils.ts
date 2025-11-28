import { generateWildcardSnsArn, generateWildcardSqsArn } from '@message-queue-toolkit/sqs'
import { applyAwsResourcePrefix } from '../applyAwsResourcePrefix.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { TopicConfig } from '../event-routing/eventRoutingConfig.ts'

/**
 * Regex to validate that topics names are following Lokalise convention.
 * pattern: <system_name>-<(flow|model)_name>
 *
 * Regex explanation:
 * To support repository names containing hyphens or underscores, we just require lowercase letters and hyphens or underscores as separators.
 *  [a-z] -> lowercase letters
 *  [-_] -> hyphens or underscores as separators
 *  Must start and end with a lowercase letter
 */
export const TOPIC_NAME_REGEX = /^[a-z]+([_-][a-z]+)+$/

/**
 * Regex to validate that queue names are following Lokalise convention.
 * pattern: <system_name>-<flow|model>_name-<service|module>_name(-<module_name>)?
 *
 * Regex explanation:
 * system_name:         [a-z]+(_[a-z]+)*        -> One or more lowercase letters, optionally separated by underscores
 * -                    -                       -> Hyphen
 * flow or model name:  [a-z]+(_[a-z]+)*        -> One or more lowercase letters, optionally separated by underscores
 * -                    -                       -> Optional Hyphen
 * service or module:   [a-z]+(_[a-z]+)*)?  -> One or more lowercase letters, optionally separated by underscores
 * (-                   -                       -> Optional hyphen
 * module_name:         [a-z]+(_[a-z]+)*)?      -> Optional: One or more lowercase letters, optionally separated by underscores
 */
export const QUEUE_NAME_REGEX =
  /^[a-z]+(_[a-z]+)*-[a-z]+(_[a-z]+)*(?:-[a-z]+(_[a-z]+)*)?(?:-[a-z]+(_[a-z]+)*)?$/

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
