import type { AwsTagsParams } from '@lokalise/aws-event-routing-types'

export type { AwsTagsParams } from '@lokalise/aws-event-routing-types'

type AppEnv = 'production' | 'development' | 'staging'
type TagEnv = 'dev' | 'stage' | 'live'

/** Internal utility method to build specific aws service tags */
export const buildResourceTags = (
  params: AwsTagsParams,
  awsService: string,
): Record<string, string> => ({
  env: appEnvToTagEnv(params.appEnv),
  project: params.project,
  service: awsService,
  'lok-owner': params.owner,
  'lok-cost-system': params.system,
  'lok-cost-service': params.service,
})

const appEnvToTagEnv = (appEnv: AppEnv): TagEnv => {
  switch (appEnv) {
    case 'production':
      return 'live'
    case 'development':
      return 'dev'
    case 'staging':
      return 'stage'
  }
}
