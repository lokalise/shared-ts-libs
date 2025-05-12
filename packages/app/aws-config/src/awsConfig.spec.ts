import { ConfigScope } from '@lokalise/node-core'
import { getAwsConfig, testResetAwsConfig } from './awsConfig.ts'

const AWS_ALLOWED_SOURCE_OWNER_LITERAL = 'allowed-source-owner'
const AWS_RESOURCE_PREFIX_LITERAL = 'aws-prefix'
const AWS_ENDPOINT_LITERAL = 'aws-endpoint'
const KMS_KEY_ID_LITERAL = 'kms-key-id'
const DEFAULT_REGION = 'eu-west-1'

describe('awsConfig', () => {
  describe.each([true, false])('getAwsConfig - using configScope %s', (isConfigScopeUsed) => {
    beforeEach(() => {
      process.env = {}
      testResetAwsConfig()
    })

    const buildAwsConfig = (env: Record<string, string>) => {
      let configScope: ConfigScope | undefined
      if (isConfigScopeUsed) {
        configScope = new ConfigScope(env)
      } else {
        process.env = env
      }

      return getAwsConfig(configScope)
    }

    it('provides aws config', () => {
      const config = buildAwsConfig({
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ENDPOINT: AWS_ENDPOINT_LITERAL,
        AWS_ALLOWED_SOURCE_OWNER: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        AWS_RESOURCE_PREFIX: AWS_RESOURCE_PREFIX_LITERAL,
        AWS_ACCESS_KEY_ID: 'access-key-id',
        AWS_SECRET_ACCESS_KEY: 'secret-access-key',
      })

      expect(config).toEqual({
        region: DEFAULT_REGION,
        kmsKeyId: KMS_KEY_ID_LITERAL,
        allowedSourceOwner: AWS_ALLOWED_SOURCE_OWNER_LITERAL,
        endpoint: AWS_ENDPOINT_LITERAL,
        resourcePrefix: AWS_RESOURCE_PREFIX_LITERAL,
        credentials: {
          accessKeyId: 'access-key-id',
          secretAccessKey: 'secret-access-key',
        },
      })
    })

    it('provides aws config with default credentials resolver when not explicitly provided', () => {
      const config = buildAwsConfig({
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
      })

      expect(config).toEqual({
        region: DEFAULT_REGION,
        kmsKeyId: KMS_KEY_ID_LITERAL,
        allowedSourceOwner: '',
        endpoint: undefined,
        resourcePrefix: undefined,
        credentials: expect.any(Function),
      })
    })

    it('provides aws config with default credentials resolver when one of the values is blank', () => {
      const config = buildAwsConfig({
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: 'test',
      })

      expect(config).toEqual({
        region: DEFAULT_REGION,
        kmsKeyId: KMS_KEY_ID_LITERAL,
        allowedSourceOwner: '',
        endpoint: undefined,
        resourcePrefix: undefined,
        credentials: expect.any(Function),
      })
    })

    it('provides aws config with default credentials resolver when both values are blank', () => {
      const config = buildAwsConfig({
        AWS_REGION: DEFAULT_REGION,
        AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
      })

      expect(config).toEqual({
        region: DEFAULT_REGION,
        kmsKeyId: KMS_KEY_ID_LITERAL,
        allowedSourceOwner: '',
        endpoint: undefined,
        resourcePrefix: undefined,
        credentials: expect.any(Function),
      })
    })

    it('checks for mandatory fields', () => {
      expect(() =>
        buildAwsConfig({
          AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
        }),
      ).toThrow('Missing mandatory configuration parameter: AWS_REGION')
    })

    it('throws error if prefix is too long', () => {
      expect(() =>
        buildAwsConfig({
          AWS_REGION: DEFAULT_REGION,
          AWS_KMS_KEY_ID: KMS_KEY_ID_LITERAL,
          AWS_RESOURCE_PREFIX: 'aws-resource-prefix',
        }),
      ).toThrow('AWS resource prefix exceeds maximum length of 12 characters: aws-resource-prefix')
    })
  })
})
