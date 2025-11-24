import type { AwsConfig } from '../awsConfig.ts'
import type { TopicConfig } from '../event-routing/eventRoutingConfig.ts'
import {
  buildQueueUrlsWithSubscribePermissionsPrefix,
  buildTopicArnsWithPublishPermissionsPrefix,
  QUEUE_NAME_REGEX,
  TOPIC_NAME_REGEX,
} from './utils.ts'

const buildTopicConfig = (
  config: Pick<TopicConfig, 'topicName' | 'isExternal' | 'externalAppsWithSubscribePermissions'>,
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
})

describe('utils', () => {
  describe('TOPIC_NAME_REGEX', () => {
    it.each(['foo-bar', 'one_two-three_four', 'foo-bar-baz'])('should match regex (%s)', (name) => {
      expect(TOPIC_NAME_REGEX.test(name)).toBe(true)
    })

    it.each([
      // Numbers not allowed
      'foo1-bar',
      'foo-bar1',

      // Underscore placement errors
      'foo-_bar', // underscore at start of second part
      '_foo-bar', // leading underscore in first part
      'foo_-bar', // trailing underscore in first part
      'foo-bar_', // trailing underscore in second part
      'foo_bar-', // second part empty with underscore
      'foo-bar_baz_', // trailing underscore in second part
      '_foo_bar-baz', // leading underscore in first part with multi-underscore
      'foo-bar-_baz', // leading underscore in second part

      // Double underscores (consecutive underscores not allowed)
      'foo__bar-baz', // double underscore in first part
      'foo-bar__baz', // double underscore in second part

      // Hyphen issues (only one hyphen allowed between two sections)
      'foo--bar', // double hyphen
      'foo-', // second part empty
      '-bar', // first part missing
      'foo-', // second part empty

      // Spaces not allowed
      'foo bar-baz',
      'foo-bar baz',
      'foo -bar',
      'foo- bar',

      // Uppercase not allowed
      'Foo-bar',
      'foo-Bar',
      'FOO-bar',
      'foo-BAR',
    ])('should not match regex (%s)', (name) => {
      expect(TOPIC_NAME_REGEX.test(name)).toBe(false)
    })
  })

  describe('QUEUE_NAME_REGEX', () => {
    it.each([
      // 2 section (valid)
      'system-flow',
      // 3 sections (valid)
      'system-flow-service',
      'my_system-main_flow-main_service',
      'a-b-c',
      'sys_name-flow_name-service_name',
      'one_two-three_four-five_six',
      // 4 sections
      'system-flow-service-module',
      'my_system-main_flow-main_service-module_name',
      'a-b-c-d',
      'one_two-three_four-five_six-seven_eight',
    ])('should match regex (%s)', (name) => {
      expect(QUEUE_NAME_REGEX.test(name)).toBe(true)
    })

    it.each([
      // too few sections
      'queue',
      // too many sections (> 4)
      'a-b-c-d-e',
      'foo-bar-baz-qux-fifth',
      // invalid characters
      'system1-flow-service', // number in first section
      'system-flow1-service', // number in second section
      'system-flow-service1', // number in third section
      'system-flow-service-module1', // number in fourth section
      'System-flow-service', // uppercase
      'system-Flow-service', // uppercase
      'system-flow-Queue', // uppercase
      // invalid underscores
      '_system-flow-service', // leading underscore in first
      'system_-flow-service', // trailing underscore in first
      'system-flow-_service', // leading underscore in third
      'system-flow-service_', // trailing underscore in third
      'system__name-flow-service', // double underscore in first part
      'system-flow__name-service', // double underscore in second part
      'system-flow-service__name', // double underscore in third part
      'system-flow-service__name-module_name', // double underscore in third when 4 sections
      // spaces and invalid hyphens
      'system flow-service-name', // space
      'system--flow-service', // double hyphen
      'system-flow--service', // double hyphen
      'system-flow-service--module', // double hyphen in 4th part
    ])('should not match regex (%s)', (name) => {
      expect(QUEUE_NAME_REGEX.test(name)).toBe(false)
    })
  })

  describe('buildTopicArnsWithPublishPermissionsPrefix', () => {
    it('should throw an error if app name cannot be extracted', () => {
      expect(() =>
        buildTopicArnsWithPublishPermissionsPrefix(
          buildTopicConfig({ topicName: '   ' }),
          buildAwsConfig(),
        ),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid topic name    ]')
    })

    it('correctly composes ARN for typical valid topic', () => {
      const result = buildTopicArnsWithPublishPermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app-' }),
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`"arn:aws:sns:*:*:my_app-*"`)
    })

    it('ensures wildcard is always present', () => {
      const result = buildTopicArnsWithPublishPermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app' }),
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`"arn:aws:sns:*:*:my_app-*"`)
    })

    it('should use prefix from awsConfig', () => {
      const resourcePrefix = 'dev'
      const result1 = buildTopicArnsWithPublishPermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app-' }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result1).toMatchInlineSnapshot(`"arn:aws:sns:*:*:dev_my_app-*"`)

      const result2 = buildTopicArnsWithPublishPermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app' }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result2).toMatchInlineSnapshot(`"arn:aws:sns:*:*:dev_my_app-*"`)
    })
  })

  describe('buildQueueUrlsWithSubscribePermissionsPrefix', () => {
    it('should throw an error if app name cannot be extracted', () => {
      expect(() =>
        buildQueueUrlsWithSubscribePermissionsPrefix(
          buildTopicConfig({ topicName: '   ' }),
          buildAwsConfig(),
        ),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid topic name    ]')
    })

    it('correctly composes ARN for typical valid topic', () => {
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app-' }),
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:my_app-*",
        ]
      `)
    })

    it('should be undefined for external topics', () => {
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app-', isExternal: true }),
        buildAwsConfig(),
      )
      expect(result).toBeUndefined()
    })

    it('ensures wildcard is always present', () => {
      const result = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app' }),
        buildAwsConfig(),
      )
      expect(result).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:my_app-*",
        ]
      `)
    })

    it('should use prefix awsConfig', () => {
      const resourcePrefix = 'dev'
      const result1 = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app-' }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result1).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:dev_my_app-*",
        ]
      `)

      const result2 = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app' }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result2).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:dev_my_app-*",
        ]
      `)
    })

    it('should use externalAppsWithSubscribePermissions', () => {
      const resourcePrefix = 'dev'
      const externalAppsWithSubscribePermissions = ['my_test1', 'my_test2-', 'my_test3-*']
      const result1 = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app-', externalAppsWithSubscribePermissions }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result1).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:dev_my_app-*",
          "arn:aws:sqs:*:*:dev_my_test1-*",
          "arn:aws:sqs:*:*:dev_my_test2-*",
          "arn:aws:sqs:*:*:dev_my_test3-*",
        ]
      `)

      const result2 = buildQueueUrlsWithSubscribePermissionsPrefix(
        buildTopicConfig({ topicName: 'my_app', externalAppsWithSubscribePermissions }),
        buildAwsConfig(resourcePrefix),
      )
      expect(result2).toMatchInlineSnapshot(`
        [
          "arn:aws:sqs:*:*:dev_my_app-*",
          "arn:aws:sqs:*:*:dev_my_test1-*",
          "arn:aws:sqs:*:*:dev_my_test2-*",
          "arn:aws:sqs:*:*:dev_my_test3-*",
        ]
      `)
    })
  })
})
