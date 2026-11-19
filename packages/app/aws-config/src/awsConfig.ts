import type { AwsCredentialIdentity, Provider } from '@smithy/types'

/** Maximum allowed length for AWS resource prefix, to ensure it doesn't exceed AWS limits when concatenated with resource names. */
export const MAX_AWS_RESOURCE_PREFIX_LENGTH = 10

/**
 * Environment variable names used for AWS configuration.
 */
export const AWS_CONFIG_ENV_VARS = {
  /** AWS region where resources will be created and requests are sent */
  REGION: 'AWS_REGION',
  /** ID or ARN of the AWS KMS key used for encryption */
  KMS_KEY_ID: 'AWS_KMS_KEY_ID',
  /** AWS account ID permitted as the source owner for cross-account access */
  ALLOWED_SOURCE_OWNER: 'AWS_ALLOWED_SOURCE_OWNER',
  /** Custom endpoint URL for AWS services (e.g., LocalStack) */
  ENDPOINT: 'AWS_ENDPOINT',
  /** Prefix applied to all AWS resource names */
  RESOURCE_PREFIX: 'AWS_RESOURCE_PREFIX',
  /** AWS access key ID for authentication */
  ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
  /** AWS secret access key for authentication */
  SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
} as const

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
  credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
}
