import type { AwsConfig } from './awsConfig.ts'

/**
 * Applies a prefix if needed to an AWS resource name based on the provided AWS configuration.
 * @param resourceName
 * @param awsConfig
 */
export const applyAwsResourcePrefix = (resourceName: string, awsConfig: AwsConfig): string => {
  if (!awsConfig.resourcePrefix) return resourceName
  return `${awsConfig.resourcePrefix}_${resourceName}`
}
