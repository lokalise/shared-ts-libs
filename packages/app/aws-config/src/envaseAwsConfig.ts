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
export type EnvaseAwsConfigComputedType<TRaw = { accessKeyId?: string; secretAccessKey?: string }> =
  {
    credentials: (raw: TRaw) => AwsCredentialIdentity | Provider<AwsCredentialIdentity>
  }

/**
 * Options for `getEnvaseAwsConfig()`.
 */
export type EnvaseAwsConfigOptions<TPath extends string | undefined = undefined> = {
  /** The key under which AWS schema is nested in your config. Omit for flat spread at root level. */
  path?: TPath
}

/**
 * Return type of `getEnvaseAwsConfig()`.
 * Contains schema and computed fragments to spread into `createConfig()`.
 */
export type EnvaseAwsConfigFragments<TPath extends string | undefined = undefined> = {
  schema: EnvaseAwsConfigSchemaType
  computed: TPath extends string
    ? EnvaseAwsConfigComputedType<Record<TPath, { accessKeyId?: string; secretAccessKey?: string }>>
    : EnvaseAwsConfigComputedType
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
 * Creates computed values configuration for AWS config.
 * Derives `credentials` from the parsed `accessKeyId` and `secretAccessKey`.
 */
function createAwsComputed<TPath extends string | undefined>(
  path?: TPath,
): EnvaseAwsConfigFragments<TPath>['computed'] {
  const resolveCredentials = (awsRaw: {
    accessKeyId?: string
    secretAccessKey?: string
  }): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
    if (awsRaw.accessKeyId && awsRaw.secretAccessKey) {
      return { accessKeyId: awsRaw.accessKeyId, secretAccessKey: awsRaw.secretAccessKey }
    }
    return createCredentialChain(fromTokenFile(), fromInstanceMetadata(), fromEnv(), fromIni())
  }

  if (path) {
    return {
      // biome-ignore lint/suspicious/noExplicitAny: raw config shape depends on consumer's schema
      credentials: (raw: any) => resolveCredentials(raw[path]),
    } as EnvaseAwsConfigFragments<TPath>['computed']
  }

  return {
    credentials: resolveCredentials,
  } as EnvaseAwsConfigFragments<TPath>['computed']
}

/**
 * Returns AWS configuration fragments for use with envase's `createConfig()`.
 *
 * This function returns schema and computed fragments that can be spread into
 * your application's configuration. This allows composing AWS config with other
 * application-specific configuration.
 *
 * Use the `path` option when nesting AWS config under a key (e.g., `aws`),
 * so that computed resolvers access `fullParsedConfig.aws` instead of `fullParsedConfig`.
 *
 * @example
 * ```typescript
 * import { createConfig, envvar } from 'envase'
 * import { z } from 'zod'
 * import { getEnvaseAwsConfig } from '@lokalise/aws-config'
 *
 * // Nested under 'aws' key (recommended):
 * const awsConfig = getEnvaseAwsConfig({ path: 'aws' })
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
 * const awsConfig = getEnvaseAwsConfig()
 *
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
 * @param options - Optional configuration. Use `path` to specify the nesting key.
 * @returns Schema and computed fragments for AWS configuration
 */
export function getEnvaseAwsConfig<TPath extends string | undefined = undefined>(
  options?: EnvaseAwsConfigOptions<TPath>,
): EnvaseAwsConfigFragments<TPath> {
  return {
    schema: envaseAwsConfigSchema,
    computed: createAwsComputed(options?.path),
  }
}
