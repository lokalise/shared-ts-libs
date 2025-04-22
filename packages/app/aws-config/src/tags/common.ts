type AppEnv = 'production' | 'development' | 'staging'
type TagEnv = 'dev' | 'stage' | 'live'

export type AwsTagsParams<
  System extends string = string,
  Owner extends string = string,
  Project extends string = string,
  Service extends string = string,
> = {
  /** Specifies the application environment. */
  appEnv: AppEnv
  /** The overarching system or domain in which the project/service operates. This may refer to a business unit, department, or technical system grouping. */
  system: System
  /** The team or individual that owns the AWS resource. Useful for accountability and contact purposes */
  owner: Owner
  /** The broader project this resource is associated with. This might group several services or resources under one initiative */
  project: Project
  /** The name of the microservice, application, or AWS service this resource belongs to */
  service: Service
}

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
