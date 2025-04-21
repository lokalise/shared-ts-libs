import { type AwsTagsParams, buildResourceTags } from './common.ts'

export const getSqsTags = (params: AwsTagsParams): Record<string, string> =>
  buildResourceTags(params, 'sqs')
