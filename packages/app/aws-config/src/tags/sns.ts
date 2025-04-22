import type { Tag } from '@aws-sdk/client-sns'
import { type AwsTagsParams, buildResourceTags } from './common.ts'

/**
 * Builds tags for SNS resources.
 * @param params - The parameters to build tags from.
 * @returns An array of tags for SNS resources.
 */
export const getSnsTags = (params: AwsTagsParams): Tag[] =>
  Object.entries(buildResourceTags(params, 'sns')).map(([Key, Value]) => ({ Key, Value }))
