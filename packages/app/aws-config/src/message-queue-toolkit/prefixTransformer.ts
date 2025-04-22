import { generateWildcardSnsArn, generateWildcardSqsArn } from '@message-queue-toolkit/sqs'

/**
 * Transform the given value to a SNS wildcard ARN.
 * * @param value
 */
export const snsPrefixTransformer = (value: string): string =>
  generateWildcardSnsArn(ensureWildcard(value))

/**
 * Transform the given value to a SQS wildcard ARN.
 * @param value
 */
export const sqsPrefixTransformer = (value: string[]): string[] =>
  value.map((v) => generateWildcardSqsArn(ensureWildcard(v)))

const ensureWildcard = (value: string) => (value.endsWith('*') ? value : `${value}*`)
