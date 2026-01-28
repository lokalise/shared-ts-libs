import {
  createCredentialChain,
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromTokenFile,
} from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentity, Provider } from '@smithy/types'
import { createConfig, envvar, type InferConfig, type InferEnv } from 'envase'
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
type EnvaseAwsConfigSchemaType = {
  region: EnvvarEntry<z.ZodString>
  kmsKeyId: EnvvarEntry<z.ZodDefault<z.ZodOptional<z.ZodString>>>
  allowedSourceOwner: EnvvarEntry<z.ZodOptional<z.ZodString>>
  endpoint: EnvvarEntry<z.ZodOptional<z.ZodURL>>
  resourcePrefix: EnvvarEntry<z.ZodOptional<z.ZodString>>
  accessKeyId: EnvvarEntry<z.ZodOptional<z.ZodString>>
  secretAccessKey: EnvvarEntry<z.ZodOptional<z.ZodString>>
}

/**
 * The raw AWS configuration schema for parsing environment variables.
 * This schema is used with envase's `createConfig()` to parse and validate AWS-related env vars.
 */
export const envaseAwsConfigSchema: EnvaseAwsConfigSchemaType = {
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
} as const

/**
 * Computed values configuration for AWS config.
 * Derives `credentials` from the parsed `accessKeyId` and `secretAccessKey`.
 */
const envaseAwsConfigComputed = {
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
 * Type representing the parsed and computed AWS configuration.
 * Includes both the raw parsed values and the computed `credentials` field.
 */
export type EnvaseAwsConfig = InferConfig<
  InferEnv<typeof envaseAwsConfigSchema>,
  typeof envaseAwsConfigComputed
>

/**
 * Type alias for the schema, for backwards compatibility.
 * @deprecated Use `typeof envaseAwsConfigSchema` directly for schema type.
 */
export type EnvaseAwsConfigSchema = typeof envaseAwsConfigSchema

let envaseAwsConfig: EnvaseAwsConfig | undefined

/**
 * Retrieves the AWS configuration from environment variables (singleton).
 *
 * This function uses envase's `createConfig()` to parse and validate AWS-related
 * environment variables, then computes the `credentials` field from the parsed values.
 *
 * The result is cached after the first call. To reset the cache (e.g., in tests),
 * use `testResetEnvaseAwsConfig()`.
 *
 * @param env - Optional environment variables to use on first call.
 *              If not provided, uses `process.env`. Ignored if config is already cached.
 *
 * @example
 * ```typescript
 * import { getEnvaseAwsConfig, envaseAwsConfigSchema } from '@lokalise/aws-config'
 *
 * // Get AWS config from environment
 * const awsConfig = getEnvaseAwsConfig()
 * // awsConfig.credentials is automatically resolved
 * // awsConfig.region, awsConfig.kmsKeyId, etc. are available
 *
 * // For composed schemas, use createConfig directly:
 * import { createConfig, envvar } from 'envase'
 * const config = createConfig(process.env, {
 *   schema: {
 *     aws: envaseAwsConfigSchema,
 *     appName: envvar('APP_NAME', z.string()),
 *   },
 *   computed: {
 *     aws: {
 *       credentials: (raw) => {
 *         if (raw.aws.accessKeyId && raw.aws.secretAccessKey) {
 *           return { accessKeyId: raw.aws.accessKeyId, secretAccessKey: raw.aws.secretAccessKey }
 *         }
 *         return createCredentialChain(...)
 *       },
 *     },
 *   },
 * })
 * ```
 *
 * @returns The parsed and computed AWS configuration
 */
export const getEnvaseAwsConfig = (env?: Record<string, string | undefined>): EnvaseAwsConfig => {
  /* v8 ignore start */
  if (envaseAwsConfig) return envaseAwsConfig
  /* v8 ignore stop */

  const resolvedEnv = env ?? (process.env as Record<string, string | undefined>)
  envaseAwsConfig = createConfig(resolvedEnv, {
    schema: envaseAwsConfigSchema,
    computed: envaseAwsConfigComputed,
  })
  return envaseAwsConfig
}

/**
 * Resets the cached envase AWS configuration.
 *
 * This method is intended **only for testing purposes.**
 * It allows tests to reset the singleton state between runs
 * to ensure test isolation and prevent cross-test contamination.
 *
 * WARNING:
 * Do NOT export or expose this method from your package's public API.
 * This method is not part of the package's contract and should be used internally for testing ONLY.
 */
export const testResetEnvaseAwsConfig = () => {
  envaseAwsConfig = undefined
}
