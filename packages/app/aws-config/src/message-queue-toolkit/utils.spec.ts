import type { AwsConfig } from '../awsConfig.ts'
import type { QueueConfig, TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import {
  buildQueueUrlsWithSubscribePermissionsPrefix,
  buildTopicArnsWithPublishPermissionsPrefix,
  validateQueueConfig,
  validateTopicsConfig,
} from './utils.ts'

const buildTopicConfig = (
  config?: Pick<TopicConfig, 'topicName' | 'isExternal' | 'externalAppsWithSubscribePermissions'>,
): TopicConfig =>
  ({
    ...config,
    service: '',
    owner: '',
    queues: {},
  }) as TopicConfig

const buildAwsConfig = (resourcePrefix?: string): AwsConfig => ({
  resourcePrefix,
  kmsKeyId: '',
  allowedSourceOwner: '',
  region: '',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})

describe('utils', () => {
  describe('validateTopicsConfig', () => {
    const project = 'my-project'

    it('should validate valid topic names', () => {
      const validTopics = [
        { topicName: 'my-project-module', queues: {} },
        { topicName: 'my-project-module_name', queues: {} },
        { topicName: 'my-project-user_service', queues: {} },
        { topicName: 'my-project_legacy', queues: {} }, // underscore allowed for backwards compatibility
      ] as TopicConfig[]

      expect(() => validateTopicsConfig(validTopics, project)).not.toThrow()
    })

    it('should throw error for topic name that is too long', () => {
      const longName = `my-project-${'a'.repeat(250)}`
      const topics: TopicConfig[] = [
        { topicName: longName, queues: {} },
        { topicName: longName, isExternal: true, queues: {} },
      ] as TopicConfig[]

      expect(() => validateTopicsConfig(topics, project)).toThrow(
        `Topic name too long: ${longName}. Max allowed length is 246`,
      )
    })

    it('should throw error for topic name that does not start with project', () => {
      const topics: TopicConfig[] = [{ topicName: 'wrong-module', queues: {} } as TopicConfig]

      expect(() => validateTopicsConfig(topics, project)).toThrow(
        `Topic name must start with project name 'my-project': wrong-module`,
      )
    })

    it('should not validate external topics', () => {
      const topics: TopicConfig[] = [
        { topicName: 'wrong-module', isExternal: true, queues: {} } as TopicConfig,
      ]

      expect(() => validateTopicsConfig(topics, project)).not.toThrow()
    })

    it.each([
      'my-project', // missing entity/flow
      'my-projectmodule', // missing separator
      'my-project-Module', // uppercase is not allowed
      'my-project-module-name', // hyphen instead of underscore
      'my-project-module1', // number is not allowed
      'my-project-_module', // underscore at start of module
      'my-project-module_', // trailing underscore
      'my-project-module__name', // double underscore
    ])('should throw error for invalid topic name pattern: %s', (topicName) => {
      const topicConfig = { topicName, queues: {} } as TopicConfig

      expect(() => validateTopicsConfig([topicConfig], project)).toThrow(
        `Invalid topic name: ${topicName}`,
      )
    })

    it('should validate queues when topic is valid', () => {
      const topics: TopicConfig[] = [
        {
          topicName: 'my-project-module',
          queues: {
            queue1: { queueName: 'my-project-bad' } as QueueConfig,
          },
          service: '',
          owner: '',
        } as TopicConfig,
      ]

      expect(() => validateTopicsConfig(topics, project)).toThrow(
        'Invalid queue name: my-project-bad',
      )
    })
  })

  describe('validateQueueConfig', () => {
    const project = 'my-project'

    it('should validate valid queue names', () => {
      const validQueues = [
        { queueName: 'my-project-flow-service' },
        { queueName: 'my-project-flow_name-service_name' },
        { queueName: 'my-project-user_service-handler' },
        { queueName: 'my-project-flow-service-module' },
        { queueName: 'my-project-user_service-handler-processor' },
        { queueName: 'my-project_legacy-service' },
      ] as QueueConfig[]

      expect(() => validateQueueConfig(validQueues, project)).not.toThrow()
    })

    it('should throw error for queue name that is too long', () => {
      const longName = `my-project-${'a'.repeat(70)}`
      const queues = [
        { queueName: longName },
        { queueName: longName, isExternal: true },
      ] as QueueConfig[]

      expect(() => validateQueueConfig(queues, project)).toThrow(
        `Queue name too long: ${longName}. Max allowed length is 64`,
      )
    })

    it('should throw error for queue name that does not start with project', () => {
      const queues = [{ queueName: 'wrong-flow-service' }] as QueueConfig[]

      expect(() => validateQueueConfig(queues, project)).toThrow(
        `Queue name must start with project name 'my-project': wrong-flow-service`,
      )
    })

    it('should skip validation for external queues', () => {
      const queues = [{ queueName: 'wrong-flow-service', isExternal: true }] as QueueConfig[]

      expect(() => validateQueueConfig(queues, project)).not.toThrow()
    })

    it.each([
      'my-project-flow', // missing service segment
      'my-project', // missing segments
      'my-projectflow', // missing separators
      'my-project-Flow-service', // uppercase is not allowed
      'my-project-flow-Service', // uppercase is not allowed
      'my-project-flow1-service', // number is not allowed
      'my-project-flow-service1', // number is not allowed
      'my-project-_flow-service', // underscore at start
      'my-project-flow_-service', // trailing underscore
      'my-project-flow-_service', // underscore at start
      'my-project-flow-service_', // trailing underscore
      'my-project-flow__name-service', // double underscore
      'my-project-flow-service__name', // double underscore
      'my-project-flow-service-module-extra', // too many segments
    ])('should throw error for invalid queue name pattern: %s', (queueName) => {
      const queueConfig = { queueName } as QueueConfig

      expect(() => validateQueueConfig([queueConfig], project)).toThrow(
        `Invalid queue name: ${queueName}`,
      )
    })
  })

  describe('buildTopicArnsWithPublishPermissionsPrefix', () => {
    it('correctly composes ARN', () => {
      const result = buildTopicArnsWithPublishPermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app' }),
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`"arn:aws:sns:*:*:my_app*"`)
    })

    it('should use prefix from awsConfig', () => {
      const resourcePrefix = 'dev'
      const result1 = buildTopicArnsWithPublishPermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app' }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result1).toMatchInlineSnapshot(`"arn:aws:sns:*:*:dev_my_app*"`)
    })
  })

  describe('buildQueueUrlsWithSubscribePermissionsPrefix', () => {
    it('correctly composes ARN for typical valid topic', () => {
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig(),
        'my-app',
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:my-app-*",
        ]
      `)
    })

    it('should be undefined for external topics', () => {
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'test', isExternal: true }),
        'app',
        buildAwsConfig(),
      )
      expect(result).toBeUndefined()
    })

    it('ensures wildcard is always present', () => {
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig(),
        'my-app',
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:my-app-*",
        ]
      `)
    })

    it('should use prefix awsConfig', () => {
      const resourcePrefix = 'dev'
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig(),
        'my-app',
        buildAwsConfig(resourcePrefix),
      )
      expect(result).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:dev_my-app-*",
        ]
      `)
    })

    it('should use externalAppsWithSubscribePermissions', () => {
      const resourcePrefix = 'dev'
      const externalAppsWithSubscribePermissions = ['my-test1', 'my-test2-', 'my-test3-*']
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'test', externalAppsWithSubscribePermissions }),
        'my-app-',
        buildAwsConfig(resourcePrefix),
      )
      expect(result).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:dev_my-app-*",
          "arn:aws:sqs:*:*:dev_my-test1-*",
          "arn:aws:sqs:*:*:dev_my-test2-*",
          "arn:aws:sqs:*:*:dev_my-test3-*",
        ]
      `)
    })
  })
})
