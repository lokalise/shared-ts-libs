import {
  createCredentialChain,
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromTokenFile,
} from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentity, Provider } from '@smithy/types'
import { envvar } from 'envase'
import { z } from 'zod'
import { AWS_CONFIG_ENV_VARS, MAX_AWS_RESOURCE_PREFIX_LENGTH } from './awsConfig.ts'

/**
 * Envase schema entry type - a tuple of [envVarName, zodSchema].
 * Used to provide explicit type annotation for the schema to ensure portable type declarations.
 */
type EnvvarEntry<T> = [string, T]

/**
 * Type definition for the AWS configuration schema.
 * Explicitly defined to ensure portable TypeScript declarations.
 */
export type EnvaseAwsConfigSchemaType = {
  region: EnvvarEntry<z.ZodString>
  kmsKeyId: EnvvarEntry<z.ZodDefault<z.ZodOptional<z.ZodString>>>
  allowedSourceOwner: EnvvarEntry<z.ZodOptional<z.ZodString>>
  endpoint: EnvvarEntry<z.ZodOptional<z.ZodURL>>
  resourcePrefix: EnvvarEntry<z.ZodOptional<z.ZodString>>
  accessKeyId: EnvvarEntry<z.ZodOptional<z.ZodString>>
  secretAccessKey: EnvvarEntry<z.ZodOptional<z.ZodString>>
}

/**
 * Type for the computed credentials resolver function.
 */
export type EnvaseAwsConfigComputedType = {
  credentials: (raw: {
    accessKeyId?: string
    secretAccessKey?: string
  }) => AwsCredentialIdentity | Provider<AwsCredentialIdentity>
}

/**
 * Return type of `getEnvaseAwsConfig()`.
 * Contains schema and computed fragments to spread into `createConfig()`.
 */
export type EnvaseAwsConfigFragments = {
  schema: EnvaseAwsConfigSchemaType
  computed: EnvaseAwsConfigComputedType
}

/**
 * The raw AWS configuration schema for parsing environment variables.
 */
const envaseAwsConfigSchema: EnvaseAwsConfigSchemaType = {
  region: envvar(
    AWS_CONFIG_ENV_VARS.REGION,
    z.string().min(1).describe('AWS region for resource management'),
  ),

  kmsKeyId: envvar(
    AWS_CONFIG_ENV_VARS.KMS_KEY_ID,
    z.string().optional().default('').describe('KMS key ID for encryption/decryption'),
  ),

  allowedSourceOwner: envvar(
    AWS_CONFIG_ENV_VARS.ALLOWED_SOURCE_OWNER,
    z.string().optional().describe('AWS account ID for permitted request source'),
  ),

  endpoint: envvar(
    AWS_CONFIG_ENV_VARS.ENDPOINT,
    z.url().optional().describe('Custom AWS service endpoint URL'),
  ),

  resourcePrefix: envvar(
    AWS_CONFIG_ENV_VARS.RESOURCE_PREFIX,
    z
      .string()
      .max(MAX_AWS_RESOURCE_PREFIX_LENGTH, {
        message: `AWS resource prefix exceeds maximum length of ${MAX_AWS_RESOURCE_PREFIX_LENGTH} characters`,
      })
      .optional()
      .describe('Prefix for AWS resource names (max 10 chars)'),
  ),

  accessKeyId: envvar(
    AWS_CONFIG_ENV_VARS.ACCESS_KEY_ID,
    z.string().optional().describe('AWS access key ID for programmatic access'),
  ),

  secretAccessKey: envvar(
    AWS_CONFIG_ENV_VARS.SECRET_ACCESS_KEY,
    z.string().optional().describe('AWS secret access key for programmatic access'),
  ),
}

/**
 * Computed values configuration for AWS config.
 * Derives `credentials` from the parsed `accessKeyId` and `secretAccessKey`.
 */
const envaseAwsConfigComputed: EnvaseAwsConfigComputedType = {
  credentials: (raw: {
    accessKeyId?: string
    secretAccessKey?: string
  }): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
    if (raw.accessKeyId && raw.secretAccessKey) {
      return { accessKeyId: raw.accessKeyId, secretAccessKey: raw.secretAccessKey }
    }
    return createCredentialChain(fromTokenFile(), fromInstanceMetadata(), fromEnv(), fromIni())
  },
}

/**
 * Returns AWS configuration fragments for use with envase's `createConfig()`.
 *
 * This function returns schema and computed fragments that can be spread into
 * your application's configuration. This allows composing AWS config with other
 * application-specific configuration.
 *
 * @example
 * ```typescript
 * import { createConfig, envvar } from 'envase'
 * import { z } from 'zod'
 * import { getEnvaseAwsConfig } from '@lokalise/aws-config'
 *
 * const awsConfig = getEnvaseAwsConfig()
 *
 * const config = createConfig(process.env, {
 *   schema: {
 *     aws: awsConfig.schema,
 *     appName: envvar('APP_NAME', z.string()),
 *   },
 *   computed: {
 *     aws: awsConfig.computed,
 *   },
 * })
 *
 * // Or spread directly at root level:
 * const config = createConfig(process.env, {
 *   schema: {
 *     ...awsConfig.schema,
 *     appName: envvar('APP_NAME', z.string()),
 *   },
 *   computed: {
 *     ...awsConfig.computed,
 *   },
 * })
 * ```
 *
 * @returns Schema and computed fragments for AWS configuration
 */
export const getEnvaseAwsConfig = (): EnvaseAwsConfigFragments => {
  return {
    schema: envaseAwsConfigSchema,
    computed: envaseAwsConfigComputed,
  }
}
