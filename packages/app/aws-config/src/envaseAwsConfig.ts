import {
  createCredentialChain,
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromTokenFile,
} from '@aws-sdk/credential-providers'
import { type EnvvarEntry, envvar } from 'envase'
import { z } from 'zod'
import { AWS_CONFIG_ENV_VARS, type AwsConfig, MAX_AWS_RESOURCE_PREFIX_LENGTH } from './awsConfig.ts'

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

type AwsCredentialsEnv = { accessKeyId?: string; secretAccessKey?: string }

/**
 * Type for the computed credentials resolver function.
 * It receives the full parsed config and reads the credentials from under the `TPath` key.
 */
export type EnvaseAwsConfigComputedType<TPath extends string = 'aws'> = {
  credentials: (raw: Record<TPath, AwsCredentialsEnv>) => AwsConfig['credentials']
}

/**
 * Options for `getEnvaseAwsConfig()`.
 */
export type EnvaseAwsConfigOptions<TPath extends string = 'aws'> = {
  /** The key under which the AWS schema is nested in your config. Defaults to `aws`. */
  path?: TPath
}

/**
 * Return type of `getEnvaseAwsConfig()`.
 * Contains schema and computed fragments to nest under the same key in `createConfig()`.
 */
export type EnvaseAwsConfigFragments<TPath extends string = 'aws'> = {
  schema: EnvaseAwsConfigSchemaType
  computed: EnvaseAwsConfigComputedType<TPath>
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
    { sensitive: true },
  ),
}

/**
 * Returns static credentials when both `accessKeyId` and `secretAccessKey` are set,
 * otherwise the default credential provider chain.
 */
const resolveCredentials = ({
  accessKeyId,
  secretAccessKey,
}: AwsCredentialsEnv): AwsConfig['credentials'] => {
  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey }
  }

  return createCredentialChain(fromTokenFile(), fromInstanceMetadata(), fromEnv(), fromIni())
}

/**
 * Returns AWS configuration fragments for use with envase's `createConfig()`.
 *
 * Nest `schema` and `computed` under the same key in your config, `aws` by default.
 * Use the `path` option to nest them under a different key, so that the computed
 * credentials resolver reads `fullParsedConfig[path]`.
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
 * ```
 *
 * @param options - Optional configuration. Use `path` to nest under a key other than `aws`.
 * @returns Schema and computed fragments for AWS configuration
 */
export function getEnvaseAwsConfig<TPath extends string = 'aws'>(
  options?: EnvaseAwsConfigOptions<TPath>,
): EnvaseAwsConfigFragments<TPath> {
  // `TPath` defaults to 'aws' exactly when `path` is omitted
  const path = (options?.path ?? 'aws') as TPath
  return {
    schema: envaseAwsConfigSchema,
    computed: {
      credentials: (raw) => resolveCredentials(raw[path]),
    },
  }
}
