import {
  createCredentialChain,
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromTokenFile,
} from '@aws-sdk/credential-providers'
import { ConfigScope } from '@lokalise/node-core'
import type { AwsCredentialIdentity, Provider } from '@smithy/types'

/** Maximum allowed length for AWS resource prefix, to ensure it doesn't exceed AWS limits when concatenated with resource names. */
const MAX_AWS_RESOURCE_PREFIX_LENGTH = 10

/**
 * Configuration settings for AWS integration.
 */
export type AwsConfig = {
  /** The AWS region in which resources are managed or requests are sent */
  region: string
  /** The ID of the KMS (Key Management Service) key used for encryption or decryption */
  kmsKeyId: string
  /** AWS account ID or identifier for the permitted source of requests */
  allowedSourceOwner?: string
  /** Custom endpoint URL to override the default AWS service endpoint */
  endpoint?: string
  /** String to prefix AWS resource names */
  resourcePrefix?: string
  /** AWS credentials or a provider function that returns credentials */
  credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
}

let awsConfig: AwsConfig | undefined

/**
 * Retrieves the AWS configuration settings from the environment variables.
 */
export const getAwsConfig = (configScope?: ConfigScope): AwsConfig => {
  /* v8 ignore next */
  if (awsConfig) return awsConfig

  const resolvedConfigScope = configScope ?? new ConfigScope()
  awsConfig = generateAwsConfig(resolvedConfigScope)
  validateAwsConfig(awsConfig)

  return awsConfig
}

const generateAwsConfig = (configScope: ConfigScope): AwsConfig => {
  return {
    region: configScope.getMandatory('AWS_REGION'),
    kmsKeyId: configScope.getOptionalNullable('AWS_KMS_KEY_ID', ''),
    allowedSourceOwner: configScope.getOptionalNullable('AWS_ALLOWED_SOURCE_OWNER', undefined),
    endpoint: configScope.getOptionalNullable('AWS_ENDPOINT', undefined),
    resourcePrefix: configScope.getOptionalNullable('AWS_RESOURCE_PREFIX', undefined),
    credentials: resolveCredentials(configScope),
  }
}

const validateAwsConfig = (config: AwsConfig): void => {
  if (config.resourcePrefix && config.resourcePrefix.length > MAX_AWS_RESOURCE_PREFIX_LENGTH) {
    throw new Error(
      `AWS resource prefix exceeds maximum length of ${MAX_AWS_RESOURCE_PREFIX_LENGTH} characters: ${config.resourcePrefix}`,
    )
  }
}

const resolveCredentials = (
  configScope: ConfigScope,
): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
  const accessKeyId = configScope.getOptionalNullable('AWS_ACCESS_KEY_ID', undefined)
  const secretAccessKey = configScope.getOptionalNullable('AWS_SECRET_ACCESS_KEY', undefined)

  if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey }

  return createCredentialChain(fromTokenFile(), fromInstanceMetadata(), fromEnv(), fromIni())
}

/**
 * Resets the cached AWS configuration.
 *
 * This method is intended **only for testing purposes.**
 * It allows tests to reset the singleton state between runs
 * to ensure test isolation and prevent cross-test contamination.
 *
 * WARNING:
 * Do NOT export or expose this method from your package's public API
 * This method is not part of the package's contract and should be used internally for testing ONLY.
 */
export const testResetAwsConfig = () => {
  awsConfig = undefined
}
