import {
  createCredentialChain,
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromTokenFile,
} from '@aws-sdk/credential-providers'
import { ConfigScope } from '@lokalise/node-core'
import type { AwsCredentialIdentity, Provider } from '@smithy/types'

/**
 * Configuration settings for AWS integration.
 */
export type AwsConfig = {
  /** The AWS region in which resources are managed or requests are sent */
  region: string
  /** The ID of the KMS (Key Management Service) key used for encryption or decryption */
  kmsKeyId: string
  /** AWS account ID or identifier for the permitted source of requests */
  allowedSourceOwner: string
  /** Custom endpoint URL to override the default AWS service endpoint */
  endpoint?: string
  /** String to prefix AWS resource names */
  resourcePrefix?: string
  /** AWS credentials or a provider function that returns credentials */
  credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
}

/**
 * Retrieves the AWS configuration settings from the environment variables.
 */
export const getAwsConfig = (): AwsConfig => {
  const configScope = new ConfigScope()

  return {
    region: configScope.getMandatory('AWS_REGION'),
    kmsKeyId: configScope.getOptionalNullable('AWS_KMS_KEY_ID', ''),
    allowedSourceOwner: configScope.getOptional('AWS_ALLOWED_SOURCE_OWNER', ''),
    endpoint: configScope.getOptionalNullable('AWS_ENDPOINT', undefined),
    resourcePrefix: configScope.getOptionalNullable('AWS_RESOURCE_PREFIX', undefined),
    credentials: resolveCredentials(configScope),
  }
}

export const applyAwsResourcePrefix = (resourceName: string, awsConfig: AwsConfig): string => {
  if (!awsConfig.resourcePrefix) return resourceName
  return `${awsConfig.resourcePrefix}_${resourceName}`
}

const resolveCredentials = (
  configScope: ConfigScope,
): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
  const accessKeyId = configScope.getOptionalNullable('AWS_ACCESS_KEY_ID', undefined)
  const secretAccessKey = configScope.getOptionalNullable('AWS_SECRET_ACCESS_KEY', undefined)

  if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey }

  return createCredentialChain(fromTokenFile(), fromInstanceMetadata(), fromEnv(), fromIni())
}
