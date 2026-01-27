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
import { AWS_CONFIG_ENV_VARS, type AwsConfig, MAX_AWS_RESOURCE_PREFIX_LENGTH } from './awsConfig.ts'

/**
 * Envase configuration entry type - a tuple of [envVarName, zodSchema].
 * This mirrors envase's internal EnvvarEntry type to avoid referencing internal paths.
 */
type EnvaseConfigEntry<T> = [string, T]

/**
 * Type representing the envase-compatible AWS configuration schema for type inference.
 * The `credentials` field is automatically resolved via a Zod transform when `parseEnv()` is called.
 * Uses `z.ZodType` for credentials since `ZodEffects` is internal in Zod v4.
 */
export type EnvaseAwsConfigSchema = {
  region: EnvaseConfigEntry<z.ZodString>
  kmsKeyId: EnvaseConfigEntry<z.ZodDefault<z.ZodOptional<z.ZodString>>>
  allowedSourceOwner: EnvaseConfigEntry<z.ZodOptional<z.ZodString>>
  endpoint: EnvaseConfigEntry<z.ZodOptional<z.ZodURL>>
  resourcePrefix: EnvaseConfigEntry<z.ZodOptional<z.ZodString>>
  credentials: EnvaseConfigEntry<z.ZodType<AwsCredentialIdentity | Provider<AwsCredentialIdentity>>>
}

/**
 * Type alias for `AwsConfig` used with envase-based configuration.
 * This ensures consistency between ConfigScope and envase implementations.
 */
export type EnvaseAwsConfig = AwsConfig

/**
 * Resolves AWS credentials from environment variables.
 * If both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are provided,
 * returns static credentials. Otherwise, returns a credential provider chain.
 */
const resolveCredentialsFromEnv = (
  env: Record<string, string | undefined>,
): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
  const accessKeyId = env[AWS_CONFIG_ENV_VARS.ACCESS_KEY_ID]
  const secretAccessKey = env[AWS_CONFIG_ENV_VARS.SECRET_ACCESS_KEY]

  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey }
  }

  return createCredentialChain(fromTokenFile(), fromInstanceMetadata(), fromEnv(), fromIni())
}

let envaseAwsConfigSchema: EnvaseAwsConfigSchema | undefined

/**
 * Retrieves the envase-compatible AWS configuration schema (singleton).
 *
 * This function returns a configuration schema for use with envase's `parseEnv()`.
 * The schema includes a `credentials` field that is automatically resolved via a transform
 * when `parseEnv()` is called.
 *
 * The schema is cached after the first call. To reset the cache (e.g., in tests),
 * use `testResetEnvaseAwsConfig()`.
 *
 * @param env - Optional environment variables to use for credential resolution on first call.
 *              If not provided, uses `process.env`. Ignored if schema is already cached.
 *
 * @example
 * ```typescript
 * import { InferEnv, parseEnv, envvar } from 'envase'
 * import { getEnvaseAwsConfig } from '@lokalise/aws-config'
 *
 * const envSchema = {
 *   aws: getEnvaseAwsConfig(),
 *   appName: envvar('APP_NAME', z.string()),
 * }
 *
 * type Config = InferEnv<typeof envSchema>
 * // Config.aws.credentials is correctly typed
 *
 * const config = parseEnv(process.env, envSchema)
 * // config.aws.credentials is automatically resolved
 * ```
 *
 * @returns An envase-compatible configuration schema for AWS settings
 */
export const getEnvaseAwsConfig = (
  env?: Record<string, string | undefined>,
): EnvaseAwsConfigSchema => {
  // Return cached singleton if available
  /* v8 ignore start */
  if (envaseAwsConfigSchema) return envaseAwsConfigSchema
  /* v8 ignore stop */

  // Generate and cache the schema
  envaseAwsConfigSchema = generateEnvaseAwsConfig(env)
  return envaseAwsConfigSchema
}

const generateEnvaseAwsConfig = (
  env?: Record<string, string | undefined>,
): EnvaseAwsConfigSchema => {
  const resolvedEnv = env ?? (process.env as Record<string, string | undefined>)
  return {
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

    // Credentials field - uses ACCESS_KEY_ID as trigger, transform reads both credentials from env
    credentials: envvar(
      AWS_CONFIG_ENV_VARS.ACCESS_KEY_ID,
      z
        .string()
        .optional()
        .transform(() => resolveCredentialsFromEnv(resolvedEnv))
        .describe('AWS credentials (resolved from ACCESS_KEY_ID and SECRET_ACCESS_KEY)'),
    ),
  }
}

/**
 * Resets the cached envase AWS configuration schema.
 *
 * This method is intended **only for testing purposes.**
 * It allows tests to reset the singleton state between runs
 * to ensure test isolation and prevent cross-test contamination.
 *
 * WARNING:
 * Do NOT export or expose this method from your package's public API
 * This method is not part of the package's contract and should be used internally for testing ONLY.
 */
export const testResetEnvaseAwsConfig = () => {
  envaseAwsConfigSchema = undefined
}
