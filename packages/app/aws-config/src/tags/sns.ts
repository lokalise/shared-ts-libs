import type { Tag } from '@aws-sdk/client-sns'
import { type AwsTagsParams, buildResourceTags } from './common.ts'

export const getSnsTags = (params: AwsTagsParams): Tag[] =>
  Object.entries(buildResourceTags(params, 'sns')).map(([Key, Value]) => ({ Key, Value }))
