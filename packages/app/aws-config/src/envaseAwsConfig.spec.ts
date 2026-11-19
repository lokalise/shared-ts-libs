import { createConfig, envvar } from 'envase'
import { z } from 'zod'
import { type EnvaseAwsConfigFragments, getEnvaseAwsConfig } from './envaseAwsConfig.ts'

const AWS_ALLOWED_SOURCE_OWNER_LITERAL = 'allowed-source-owner'
const AWS_RESOURCE_PREFIX_LITERAL = 'aws-prefix'
const KMS_KEY_ID_LITERAL = 'kms-key-id'
const DEFAULT_REGION = 'eu-west-1'

const createAwsConfig = (env: Record<string, string | undefined>) => {
  const awsConfig = getEnvaseAwsConfig()

  return createConfig(env, {
    schema: { aws: awsConfig.schema },
    computed: { aws: awsConfig.computed },
  }).aws
}

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

  describe('using fragments with createConfig (nested under aws key)', () => {
    it('works nested under aws key alongside other config', () => {
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
          aws: awsConfig.schema,
          appName: envvar('APP_NAME', z.string()),
        },
        computed: {
          aws: awsConfig.computed,
        },
      })

      expect(config.aws.region).toBe(DEFAULT_REGION)
      expect(config.aws.kmsKeyId).toBe(KMS_KEY_ID_LITERAL)
      expect(config.aws.allowedSourceOwner).toBe(AWS_ALLOWED_SOURCE_OWNER_LITERAL)
      expect(config.aws.endpoint).toBe('http://localhost:4566')
      expect(config.aws.resourcePrefix).toBe(AWS_RESOURCE_PREFIX_LITERAL)
      expect(config.aws.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
      expect(config.appName).toBe('my-app')
    })

    it('applies default values for optional fields', () => {
      const config = createAwsConfig({ AWS_REGION: DEFAULT_REGION })

      expect(config.region).toBe(DEFAULT_REGION)
      expect(config.kmsKeyId).toBe('')
      expect(config.allowedSourceOwner).toBeUndefined()
      expect(config.endpoint).toBeUndefined()
      expect(config.resourcePrefix).toBeUndefined()
      // credentials is a credential chain function when not explicitly provided
      expect(config.credentials).toEqual(expect.any(Function))
    })

    it('throws error when mandatory region is missing', () => {
      expect(() => createAwsConfig({})).toThrow()
    })

    it('throws error when resource prefix exceeds maximum length', () => {
      expect(() =>
        createAwsConfig({
          AWS_REGION: DEFAULT_REGION,
          AWS_RESOURCE_PREFIX: 'aws-resource-prefix-too-long',
        }),
      ).toThrow('AWS resource prefix exceeds maximum length of 10 characters')
    })

    it('throws error when endpoint is not a valid URL', () => {
      expect(() =>
        createAwsConfig({ AWS_REGION: DEFAULT_REGION, AWS_ENDPOINT: 'not-a-valid-url' }),
      ).toThrow()
    })

    it('accepts valid endpoint URL', () => {
      const config = createAwsConfig({
        AWS_REGION: DEFAULT_REGION,
        AWS_ENDPOINT: 'http://localhost:4566',
      })

      expect(config.endpoint).toBe('http://localhost:4566')
    })
  })

  describe('using fragments with createConfig (nested under custom key)', () => {
    it('resolves credentials from the key given as path', () => {
      const env = {
        AWS_REGION: DEFAULT_REGION,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      }

      const awsConfig = getEnvaseAwsConfig({ path: 'awsSettings' })

      const config = createConfig(env, {
        schema: { awsSettings: awsConfig.schema },
        computed: { awsSettings: awsConfig.computed },
      })

      expect(config.awsSettings.region).toBe(DEFAULT_REGION)
      expect(config.awsSettings.credentials).toEqual({
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      })
    })
  })

  describe('computed credentials resolver', () => {
    it('returns static credentials when both accessKeyId and secretAccessKey are present', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({
        aws: { accessKeyId: 'test-key', secretAccessKey: 'test-secret' },
      })

      expect(result).toEqual({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      })
    })

    it('returns credential chain when accessKeyId is missing', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({ aws: { secretAccessKey: 'test-secret' } })

      expect(result).toEqual(expect.any(Function))
    })

    it('returns credential chain when secretAccessKey is missing', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({ aws: { accessKeyId: 'test-key' } })

      expect(result).toEqual(expect.any(Function))
    })

    it('returns credential chain when both are missing', () => {
      const awsConfig = getEnvaseAwsConfig()

      const result = awsConfig.computed.credentials({ aws: {} })

      expect(result).toEqual(expect.any(Function))
    })
  })
})
