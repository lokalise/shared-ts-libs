import { ConfigScope } from '@lokalise/node-core'
import type { AwsCredentialIdentity, Provider } from '@smithy/types'
import { envvar, type InferEnv, parseEnv } from 'envase'
import { z } from 'zod'
import { getAwsConfig, testResetAwsConfig } from './awsConfig.ts'
import { getEnvaseAwsConfig, testResetEnvaseAwsConfig } from './envaseAwsConfig.ts'

const AWS_ALLOWED_SOURCE_OWNER_LITERAL = 'allowed-source-owner'
const AWS_RESOURCE_PREFIX_LITERAL = 'aws-prefix'
const KMS_KEY_ID_LITERAL = 'kms-key-id'
const DEFAULT_REGION = 'eu-west-1'

describe('envaseAwsConfig', () => {
  describe('getEnvaseAwsConfig', () => {
    beforeEach(() => {
      process.env = {}
      testResetEnvaseAwsConfig()
    })

    it('generates envase-compatible schema', () => {
      const schema = getEnvaseAwsConfig()

      expect(schema).toHaveProperty('region')
      expect(schema).toHaveProperty('kmsKeyId')
      expect(schema).toHaveProperty('allowedSourceOwner')
      expect(schema).toHaveProperty('endpoint')
      expect(schema).toHaveProperty('resourcePrefix')
      // credentials are resolved separately from process.env, not parsed through envase
    })

    it('parses valid environment variables with credentials', () => {
      const endpointUrl = 'http://localhost:4566'
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ENDPOINT: endpointUrl,
        AWS_ALLOWED_SOURCE_OWNER: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        AWS_RESOURCE_PREFIX: AWS_RESOURCE_PREFIX_LITERAL,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      // Pass env to getEnvaseAwsConfig to get schema with correct credential resolution
      const schema = getEnvaseAwsConfig(env)
      const config = parseEnv(env, schema)

      expect(config).toEqual({
        region: DEFAULT_REGION,
        kmsKeyId: KMS_KEY_ID_LITERAL,
        allowedSourceOwner: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        endpoint: endpointUrl,
        resourcePrefix: AWS_RESOURCE_PREFIX_LITERAL,
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      })
    })

    it('applies default values for optional fields with credential chain', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
      }

      // Pass env to getEnvaseAwsConfig to get schema with correct credential resolution
      const schema = getEnvaseAwsConfig(env)
      const config = parseEnv(env, schema)

      expect(config.region).toBe(DEFAULT_REGION)
      expect(config.kmsKeyId).toBe('')
      expect(config.allowedSourceOwner).toBeUndefined()
      expect(config.endpoint).toBeUndefined()
      expect(config.resourcePrefix).toBeUndefined()
      // credentials is a credential chain function when not explicitly provided
      expect(config.credentials).toEqual(expect.any(Function))
    })

    it('throws error when mandatory region is missing', () => {
      const schema = getEnvaseAwsConfig()
      const env = {}

      expect(() => parseEnv(env, schema)).toThrow()
    })

    it('throws error when resource prefix exceeds maximum length', () => {
      const schema = getEnvaseAwsConfig()
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_RESOURCE_PREFIX: 'aws-resource-prefix-too-long',
      }

      expect(() => parseEnv(env, schema)).toThrow(
        'AWS resource prefix exceeds maximum length of 10 characters',
      )
    })

    it('throws error when endpoint is not a valid URL', () => {
      const schema = getEnvaseAwsConfig()
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'not-a-valid-url',
      }

      expect(() => parseEnv(env, schema)).toThrow()
    })

    it('accepts valid endpoint URL', () => {
      const schema = getEnvaseAwsConfig()
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'http://localhost:4566',
      }

      const config = parseEnv(env, schema)

      expect(config.endpoint).toBe('http://localhost:4566')
    })
  })

  describe('EnvaseAwsConfigSchema type inference', () => {
    it('InferEnv correctly infers credentials field for standalone schema', () => {
      const schema = getEnvaseAwsConfig()

      // InferEnv should infer credentials (not accessKeyId/secretAccessKey)
      type Config = InferEnv<typeof schema>

      // The type should have credentials
      const typeCheck: Config = {
        region: 'eu-west-1',
        kmsKeyId: '',
        allowedSourceOwner: undefined,
        endpoint: undefined,
        resourcePrefix: undefined,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      }
      expect(typeCheck.credentials).toBeDefined()

      // Credentials can also be a provider function
      const withProviderCredentials: Config = {
        region: 'eu-west-1',
        kmsKeyId: '',
        allowedSourceOwner: undefined,
        endpoint: undefined,
        resourcePrefix: undefined,
        credentials: (() =>
          Promise.resolve({
            accessKeyId: 'a',
            secretAccessKey: 'b',
          })) as Provider<AwsCredentialIdentity>,
      }
      expect(withProviderCredentials.credentials).toEqual(expect.any(Function))
    })

    it('InferEnv correctly infers credentials in composed schema', () => {
      // Compose AWS config with other fields
      const envSchema = {
        aws: getEnvaseAwsConfig(),
        appName: envvar('APP_NAME', z.string()),
        port: envvar('PORT', z.coerce.number().default(3000)),
      }

      type ComposedConfig = InferEnv<typeof envSchema>

      // Verify the composed type has aws.credentials
      const config: ComposedConfig = {
        aws: {
          region: 'eu-west-1',
          kmsKeyId: '',
          allowedSourceOwner: undefined,
          endpoint: undefined,
          resourcePrefix: undefined,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
        appName: 'test-app',
        port: 8080,
      }

      // Verify the composed type requires aws.credentials
      const _config2: ComposedConfig = {
        // @ts-expect-error Missing mandatory field
        aws: {
          region: 'eu-west-1',
          kmsKeyId: '',
          allowedSourceOwner: undefined,
          endpoint: undefined,
          resourcePrefix: undefined,
        },
        appName: 'test-app',
        port: 8080,
      }

      expect(config.aws.credentials).toBeDefined()
      expect(config.appName).toBe('test-app')
      expect(config.port).toBe(8080)
    })

    it('parseEnv with composed schema returns correct credentials', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
        APP_NAME: 'my-app',
        PORT: '9000',
      }

      const envSchema = {
        aws: getEnvaseAwsConfig(env),
        appName: envvar('APP_NAME', z.string()),
        port: envvar('PORT', z.coerce.number().default(3000)),
      }

      const config = parseEnv(env, envSchema)

      expect(config.aws.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
      expect(config.appName).toBe('my-app')
      expect(config.port).toBe(9000)
    })
  })

  describe('getEnvaseAwsConfig with custom env', () => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
      testResetEnvaseAwsConfig()
    })

    it('returns config with static credentials when custom env provided', () => {
      const customEnv = {
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ENDPOINT: 'http://localhost:4566',
        AWS_ALLOWED_SOURCE_OWNER: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        AWS_RESOURCE_PREFIX: AWS_RESOURCE_PREFIX_LITERAL,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      const schema = getEnvaseAwsConfig(customEnv)
      const config = parseEnv(customEnv, schema)

      expect(config).toEqual({
        region: DEFAULT_REGION,
        kmsKeyId: KMS_KEY_ID_LITERAL,
        allowedSourceOwner: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        endpoint: 'http://localhost:4566',
        resourcePrefix: AWS_RESOURCE_PREFIX_LITERAL,
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      })
    })

    it('returns config with credential chain when credentials missing from custom env', () => {
      const customEnv = {
        AWS_REGION: DEFAULT_REGION,
      }

      const schema = getEnvaseAwsConfig(customEnv)
      const config = parseEnv(customEnv, schema)

      expect(config.credentials).toEqual(expect.any(Function))
    })

    it('matches getAwsConfig output structure', () => {
      const envVars = {
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ALLOWED_SOURCE_OWNER: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        AWS_RESOURCE_PREFIX: AWS_RESOURCE_PREFIX_LITERAL,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      const schema = getEnvaseAwsConfig(envVars)
      const envaseConfig = parseEnv(envVars, schema)
      const configScopeConfig = getAwsConfig(new ConfigScope(envVars))

      expect(envaseConfig.region).toBe(configScopeConfig.region)
      expect(envaseConfig.kmsKeyId).toBe(configScopeConfig.kmsKeyId)
      expect(envaseConfig.allowedSourceOwner).toBe(configScopeConfig.allowedSourceOwner)
      expect(envaseConfig.resourcePrefix).toBe(configScopeConfig.resourcePrefix)
      expect(envaseConfig.credentials).toEqual(configScopeConfig.credentials)
    })
  })
})
