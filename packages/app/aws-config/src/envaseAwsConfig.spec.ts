import { ConfigScope } from '@lokalise/node-core'
import { createConfig, envvar } from 'envase'
import { z } from 'zod'
import { getAwsConfig, testResetAwsConfig } from './awsConfig.ts'
import { type EnvaseAwsConfigFragments, getEnvaseAwsConfig } from './envaseAwsConfig.ts'

const AWS_ALLOWED_SOURCE_OWNER_LITERAL = 'allowed-source-owner'
const AWS_RESOURCE_PREFIX_LITERAL = 'aws-prefix'
const KMS_KEY_ID_LITERAL = 'kms-key-id'
const DEFAULT_REGION = 'eu-west-1'

describe('envaseAwsConfig', () => {
  describe('getEnvaseAwsConfig', () => {
    it('returns schema and computed fragments', () => {
      const awsConfig = getEnvaseAwsConfig()

      expect(awsConfig).toHaveProperty('schema')
      expect(awsConfig).toHaveProperty('computed')
      expect(awsConfig.schema).toHaveProperty('region')
      expect(awsConfig.schema).toHaveProperty('kmsKeyId')
      expect(awsConfig.schema).toHaveProperty('allowedSourceOwner')
      expect(awsConfig.schema).toHaveProperty('endpoint')
      expect(awsConfig.schema).toHaveProperty('resourcePrefix')
      expect(awsConfig.schema).toHaveProperty('accessKeyId')
      expect(awsConfig.schema).toHaveProperty('secretAccessKey')
      expect(awsConfig.computed).toHaveProperty('credentials')
      expect(typeof awsConfig.computed.credentials).toBe('function')
    })

    it('returns correct type', () => {
      const awsConfig: EnvaseAwsConfigFragments = getEnvaseAwsConfig()

      expect(awsConfig.schema).toBeDefined()
      expect(awsConfig.computed).toBeDefined()
    })
  })

  describe('using fragments with createConfig (flat spread)', () => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
    })

    it('works with spread at root level', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ENDPOINT: 'http://localhost:4566',
        AWS_ALLOWED_SOURCE_OWNER: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        AWS_RESOURCE_PREFIX: AWS_RESOURCE_PREFIX_LITERAL,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
        APP_NAME: 'my-app',
      }

      const awsConfig = getEnvaseAwsConfig()

      const config = createConfig(env, {
        schema: {
          ...awsConfig.schema,
          appName: envvar('APP_NAME', z.string()),
        },
        computed: {
          ...awsConfig.computed,
        },
      })

      expect(config.region).toBe(DEFAULT_REGION)
      expect(config.kmsKeyId).toBe(KMS_KEY_ID_LITERAL)
      expect(config.allowedSourceOwner).toBe(AWS_ALLOWED_SOURCE_OWNER_LITERAL)
      expect(config.endpoint).toBe('http://localhost:4566')
      expect(config.resourcePrefix).toBe(AWS_RESOURCE_PREFIX_LITERAL)
      expect(config.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
      expect(config.appName).toBe('my-app')
    })

    it('applies default values for optional fields', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
      }

      const awsConfig = getEnvaseAwsConfig()

      const config = createConfig(env, {
        schema: awsConfig.schema,
        computed: awsConfig.computed,
      })

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
      const awsConfig = getEnvaseAwsConfig()

      expect(() =>
        createConfig(env, {
          schema: awsConfig.schema,
          computed: awsConfig.computed,
        }),
      ).toThrow()
    })

    it('throws error when resource prefix exceeds maximum length', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_RESOURCE_PREFIX: 'aws-resource-prefix-too-long',
      }

      const awsConfig = getEnvaseAwsConfig()

      expect(() =>
        createConfig(env, {
          schema: awsConfig.schema,
          computed: awsConfig.computed,
        }),
      ).toThrow('AWS resource prefix exceeds maximum length of 10 characters')
    })

    it('throws error when endpoint is not a valid URL', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'not-a-valid-url',
      }

      const awsConfig = getEnvaseAwsConfig()

      expect(() =>
        createConfig(env, {
          schema: awsConfig.schema,
          computed: awsConfig.computed,
        }),
      ).toThrow()
    })

    it('accepts valid endpoint URL', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'http://localhost:4566',
      }

      const awsConfig = getEnvaseAwsConfig()

      const config = createConfig(env, {
        schema: awsConfig.schema,
        computed: awsConfig.computed,
      })

      expect(config.endpoint).toBe('http://localhost:4566')
    })
  })

  describe('using fragments with createConfig (nested under aws namespace)', () => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
    })

    it('works with nested aws namespace using wrapped computed', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
        APP_NAME: 'my-app',
      }

      const awsConfig = getEnvaseAwsConfig()

      // When nesting, wrap the computed to access nested raw values
      const config = createConfig(env, {
        schema: {
          aws: awsConfig.schema,
          appName: envvar('APP_NAME', z.string()),
        },
        computed: {
          aws: {
            credentials: (raw: { aws: { accessKeyId?: string; secretAccessKey?: string } }) =>
              awsConfig.computed.credentials(raw.aws),
          },
        },
      })

      expect(config.aws.region).toBe(DEFAULT_REGION)
      expect(config.aws.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
      expect(config.appName).toBe('my-app')
    })
  })

  describe('computed credentials resolver', () => {
    it('returns static credentials when both accessKeyId and secretAccessKey are present', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      })

      expect(result).toEqual({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      })
    })

    it('returns credential chain when accessKeyId is missing', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({
        secretAccessKey: 'test-secret',
      })

      expect(result).toEqual(expect.any(Function))
    })

    it('returns credential chain when secretAccessKey is missing', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({
        accessKeyId: 'test-key',
      })

      expect(result).toEqual(expect.any(Function))
    })

    it('returns credential chain when both are missing', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({})

      expect(result).toEqual(expect.any(Function))
    })
  })

  describe('matches getAwsConfig output structure', () => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
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

      const awsConfig = getEnvaseAwsConfig()
      const envaseConfig = createConfig(envVars, {
        schema: awsConfig.schema,
        computed: awsConfig.computed,
      })
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

      const awsConfig = getEnvaseAwsConfig()
      const config = createConfig(envVars, {
        schema: awsConfig.schema,
        computed: awsConfig.computed,
      })

      expect(config.credentials).toEqual(expect.any(Function))
    })
  })
})
