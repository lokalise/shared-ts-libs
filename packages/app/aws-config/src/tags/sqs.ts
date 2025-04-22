import { type AwsTagsParams, buildResourceTags } from './common.ts'

/**
 * Builds tags for SQS resources.
 * @param params - The parameters to build tags from.
 * @returns An object containing tags for SQS resources.
 */
export const getSqsTags = (params: AwsTagsParams): Record<string, string> =>
  buildResourceTags(params, 'sqs')
