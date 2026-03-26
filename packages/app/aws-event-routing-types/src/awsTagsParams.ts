type AppEnv = 'production' | 'development' | 'staging'

export type AwsTagsParams<
  System extends string = string,
  Owner extends string = string,
  Project extends string = string,
  Service extends string = string,
> = {
  /** Specifies the application environment. */
  appEnv: AppEnv
  /** The overarching system or domain in which the project/service operates. */
  system: System
  /** The team or individual that owns the AWS resource. */
  owner: Owner
  /** The broader project this resource is associated with. */
  project: Project
  /** The name of the microservice, application, or AWS service this resource belongs to */
  service: Service
}
