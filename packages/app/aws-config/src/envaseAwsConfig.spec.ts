import {
  createCredentialChain,
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromTokenFile,
} from '@aws-sdk/credential-providers'
import { ConfigScope } from '@lokalise/node-core'
import type { AwsCredentialIdentity, Provider } from '@smithy/types'
import { createConfig, envvar, type InferConfig, type InferEnv } from 'envase'
import { z } from 'zod'
import { getAwsConfig, testResetAwsConfig } from './awsConfig.ts'
import {
  type EnvaseAwsConfig,
  envaseAwsConfigSchema,
  getEnvaseAwsConfig,
  testResetEnvaseAwsConfig,
} from './envaseAwsConfig.ts'

const AWS_ALLOWED_SOURCE_OWNER_LITERAL = 'allowed-source-owner'
const AWS_RESOURCE_PREFIX_LITERAL = 'aws-prefix'
const KMS_KEY_ID_LITERAL = 'kms-key-id'
const DEFAULT_REGION = 'eu-west-1'

describe('envaseAwsConfig', () => {
  describe('envaseAwsConfigSchema', () => {
    it('has all expected fields', () => {
      expect(envaseAwsConfigSchema).toHaveProperty('region')
      expect(envaseAwsConfigSchema).toHaveProperty('kmsKeyId')
      expect(envaseAwsConfigSchema).toHaveProperty('allowedSourceOwner')
      expect(envaseAwsConfigSchema).toHaveProperty('endpoint')
      expect(envaseAwsConfigSchema).toHaveProperty('resourcePrefix')
      expect(envaseAwsConfigSchema).toHaveProperty('accessKeyId')
      expect(envaseAwsConfigSchema).toHaveProperty('secretAccessKey')
    })
  })

  describe('getEnvaseAwsConfig', () => {
    beforeEach(() => {
      process.env = {}
      testResetEnvaseAwsConfig()
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

      const config = getEnvaseAwsConfig(env)

      expect(config).toMatchObject({
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
      // Raw fields are also present
      expect(config).toHaveProperty('accessKeyId', 'access-key-id')
      expect(config).toHaveProperty('secretAccessKey', 'secret-access-key')
    })

    it('applies default values for optional fields with credential chain', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
      }

      const config = getEnvaseAwsConfig(env)

      expect(config.region).toBe(DEFAULT_REGION)
      expect(config.kmsKeyId).toBe('')
      expect(config.allowedSourceOwner).toBeUndefined()
      expect(config.endpoint).toBeUndefined()
      expect(config.resourcePrefix).toBeUndefined()
      // credentials is a credential chain function when not explicitly provided
      expect(config.credentials).toEqual(expect.any(Function))
    })

    it('throws error when mandatory region is missing', () => {
      const env = {}

      expect(() => getEnvaseAwsConfig(env)).toThrow()
    })

    it('throws error when resource prefix exceeds maximum length', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_RESOURCE_PREFIX: 'aws-resource-prefix-too-long',
      }

      expect(() => getEnvaseAwsConfig(env)).toThrow(
        'AWS resource prefix exceeds maximum length of 10 characters',
      )
    })

    it('throws error when endpoint is not a valid URL', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'not-a-valid-url',
      }

      expect(() => getEnvaseAwsConfig(env)).toThrow()
    })

    it('accepts valid endpoint URL', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'http://localhost:4566',
      }

      const config = getEnvaseAwsConfig(env)

      expect(config.endpoint).toBe('http://localhost:4566')
    })
  })

  describe('EnvaseAwsConfig type inference', () => {
    beforeEach(() => {
      testResetEnvaseAwsConfig()
    })

    it('EnvaseAwsConfig has correct type structure', () => {
      // The type should have credentials as a computed value
      const config: EnvaseAwsConfig = {
        region: 'eu-west-1',
        kmsKeyId: '',
        allowedSourceOwner: undefined,
        endpoint: undefined,
        resourcePrefix: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      }
      expect(config.credentials).toBeDefined()

      // Credentials can also be a provider function
      const withProviderCredentials: EnvaseAwsConfig = {
        region: 'eu-west-1',
        kmsKeyId: '',
        allowedSourceOwner: undefined,
        endpoint: undefined,
        resourcePrefix: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined,
        credentials: (() =>
          Promise.resolve({
            accessKeyId: 'a',
            secretAccessKey: 'b',
          })) as Provider<AwsCredentialIdentity>,
      }
      expect(withProviderCredentials.credentials).toEqual(expect.any(Function))
    })

    it('getEnvaseAwsConfig returns correct credentials', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      const config = getEnvaseAwsConfig(env)

      expect(config.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
    })
  })

  describe('composed schema with createConfig', () => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
      testResetEnvaseAwsConfig()
    })

    it('works with composed schema using createConfig', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
        APP_NAME: 'my-app',
        PORT: '9000',
      }

      const composedSchema = {
        aws: envaseAwsConfigSchema,
        appName: envvar('APP_NAME', z.string()),
        port: envvar('PORT', z.coerce.number().default(3000)),
      }

      const computed = {
        aws: {
          credentials: (raw: {
            aws: { accessKeyId?: string; secretAccessKey?: string }
          }): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
            if (raw.aws.accessKeyId && raw.aws.secretAccessKey) {
              return { accessKeyId: raw.aws.accessKeyId, secretAccessKey: raw.aws.secretAccessKey }
            }
            return createCredentialChain(
              fromTokenFile(),
              fromInstanceMetadata(),
              fromEnv(),
              fromIni(),
            )
          },
        },
      }

      const config = createConfig(env, {
        schema: composedSchema,
        computed,
      })

      expect(config.aws.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
      expect(config.appName).toBe('my-app')
      expect(config.port).toBe(9000)
    })

    it('type inference works correctly with composed schema', () => {
      const composedSchema = {
        aws: envaseAwsConfigSchema,
        appName: envvar('APP_NAME', z.string()),
        port: envvar('PORT', z.coerce.number().default(3000)),
      }

      const computed = {
        aws: {
          credentials: (raw: {
            aws: { accessKeyId?: string; secretAccessKey?: string }
          }): AwsCredentialIdentity | Provider<AwsCredentialIdentity> => {
            if (raw.aws.accessKeyId && raw.aws.secretAccessKey) {
              return { accessKeyId: raw.aws.accessKeyId, secretAccessKey: raw.aws.secretAccessKey }
            }
            return createCredentialChain(
              fromTokenFile(),
              fromInstanceMetadata(),
              fromEnv(),
              fromIni(),
            )
          },
        },
      }

      type ComposedConfig = InferConfig<InferEnv<typeof composedSchema>, typeof computed>

      // Verify the composed type has aws.credentials
      const config: ComposedConfig = {
        aws: {
          region: 'eu-west-1',
          kmsKeyId: '',
          allowedSourceOwner: undefined,
          endpoint: undefined,
          resourcePrefix: undefined,
          accessKeyId: undefined,
          secretAccessKey: undefined,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
        appName: 'test-app',
        port: 8080,
      }

      expect(config.aws.credentials).toBeDefined()
      expect(config.appName).toBe('test-app')
      expect(config.port).toBe(8080)
    })
  })

  describe('getEnvaseAwsConfig matches getAwsConfig output structure', () => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
      testResetEnvaseAwsConfig()
    })

    it('returns config with static credentials matching ConfigScope implementation', () => {
      const envVars = {
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ALLOWED_SOURCE_OWNER: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        AWS_RESOURCE_PREFIX: AWS_RESOURCE_PREFIX_LITERAL,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      const envaseConfig = getEnvaseAwsConfig(envVars)
      const configScopeConfig = getAwsConfig(new ConfigScope(envVars))

      expect(envaseConfig.region).toBe(configScopeConfig.region)
      expect(envaseConfig.kmsKeyId).toBe(configScopeConfig.kmsKeyId)
      expect(envaseConfig.allowedSourceOwner).toBe(configScopeConfig.allowedSourceOwner)
      expect(envaseConfig.resourcePrefix).toBe(configScopeConfig.resourcePrefix)
      expect(envaseConfig.credentials).toEqual(configScopeConfig.credentials)
    })

    it('returns config with credential chain when credentials missing', () => {
      const envVars = {
        AWS_REGION: DEFAULT_REGION,
      }

      const config = getEnvaseAwsConfig(envVars)

      expect(config.credentials).toEqual(expect.any(Function))
    })
  })

  describe('getEnvaseAwsConfig caching', () => {
    beforeEach(() => {
      process.env = {}
      testResetEnvaseAwsConfig()
    })

    it('returns cached config on subsequent calls', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      const config1 = getEnvaseAwsConfig(env)
      const config2 = getEnvaseAwsConfig({ AWS_REGION: 'different-region' }) // Different env, but should return cached

      expect(config1).toBe(config2)
      expect(config2.region).toBe(DEFAULT_REGION) // Uses first call's env
    })

    it('returns fresh config after reset', () => {
      const env1 = {
        AWS_REGION: 'eu-west-1',
      }
      const env2 = {
        AWS_REGION: 'us-east-1',
      }

      const config1 = getEnvaseAwsConfig(env1)
      testResetEnvaseAwsConfig()
      const config2 = getEnvaseAwsConfig(env2)

      expect(config1.region).toBe('eu-west-1')
      expect(config2.region).toBe('us-east-1')
    })
  })
})
