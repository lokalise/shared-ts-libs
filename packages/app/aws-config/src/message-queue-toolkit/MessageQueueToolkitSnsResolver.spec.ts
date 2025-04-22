import type { EventRoutingConfig } from './../event-routing/eventRoutingConfig.ts'
import { MessageQueueToolkitSnsResolver } from './MessageQueueToolkitSnsResolver.ts'
import { beforeAll } from 'vitest'
import type { AwsConfig } from '../awsConfig.ts'

const EventRouting = {
  topic1: {
    topicName: 'test-first_entity',
    owner: 'team 1',
    service: 'service 1',
    queues: {
      topic1Queue1: {
        name: 'test-first_entity-first_service',
        owner: 'team 1',
        service: 'service 1',
      },
      topic1Queue2: {
        name: 'test-first_entity-second_service',
        owner: 'team 2',
        service: 'service 2',
      },
    },
  },
  topic2: {
    topicName: 'test-second_entity',
    isExternal: true,
    queues: {
      topic2Queue1: {
        name: 'test-second_entity-service',
        owner: 'team 1',
        service: 'service 2',
      },
    },
  },
} satisfies EventRoutingConfig

const buildAwsConfig = (awsConfig?: Partial<AwsConfig>): AwsConfig => ({
  kmsKeyId: 'test kmsKeyId',
  allowedSourceOwner: 'test allowedSourceOwner',
  region: 'test region',
  ...awsConfig,
})

describe('MessageQueueToolkitSnsResolver', () => {
  let resolver: MessageQueueToolkitSnsResolver

  beforeAll(() => {
    resolver = new MessageQueueToolkitSnsResolver(EventRouting, {
      system: 'my-system',
      project: 'my-project',
      appEnv: 'development',
    })
  })

  describe('constructor', () => {
    it('should create an instance of MessageQueueToolkitSnsResolver for empty event routing', () => {
      const resolver = new MessageQueueToolkitSnsResolver(
        {},
        {
          validateNamePatterns: true,
          appEnv: 'development',
          system: 'test system',
          project: 'test project',
        },
      )
      expect(resolver).toBeInstanceOf(MessageQueueToolkitSnsResolver)
    })

    it('should throw an error if topic name pattern is invalid and validateNamePatterns is enabled', () => {
      const config = {
        invalid: {
          topicName: 'invalid',
          isExternal: true,
          queues: {},
        },
      } satisfies EventRoutingConfig

      expect(
        () =>
          new MessageQueueToolkitSnsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid topic name: invalid]')

      expect(
        () =>
          new MessageQueueToolkitSnsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })

    it('should throw an error if queue name pattern is invalid', () => {
      const config = {
        valid: {
          topicName: 'valid-topic',
          isExternal: true,
          queues: {
            invalid: {
              name: 'invalid',
              owner: 'test',
              service: 'test',
            },
          },
        },
      } satisfies EventRoutingConfig

      expect(
        () =>
          new MessageQueueToolkitSnsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid queue name: invalid]')
      expect(
        () =>
          new MessageQueueToolkitSnsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })

    it('should work with a valid event routing config', () => {
      expect(
        () =>
          new MessageQueueToolkitSnsResolver(EventRouting, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })
  })

  describe('resolvePublisherBuildOptions', () => {
    describe('internal topics', () => {
      const topicName = EventRouting.topic1.topicName

      it('should work using all properties', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig({ resourcePrefix: 'preffix' }),
          updateAttributesIfExists: true,
          messageTypeField: 'myMessageType',
          forceTagUpdate: true,
          logMessages: true,
          isTest: true,
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
        {
          "creationConfig": {
            "allowedSourceOwner": "test allowedSourceOwner",
            "forceTagUpdate": true,
            "queueUrlsWithSubscribePermissionsPrefix": [
              "arn:aws:sqs:*:*:preffix_test-*",
            ],
            "topic": {
              "Attributes": {
                "KmsMasterKeyId": "test kmsKeyId",
              },
              "Name": "preffix_test-first_entity",
              "Tags": [
                {
                  "Key": "env",
                  "Value": "dev",
                },
                {
                  "Key": "project",
                  "Value": "my-project",
                },
                {
                  "Key": "service",
                  "Value": "sns",
                },
                {
                  "Key": "lok-owner",
                  "Value": "team 1",
                },
                {
                  "Key": "lok-cost-system",
                  "Value": "my-system",
                },
                {
                  "Key": "lok-cost-service",
                  "Value": "service 1",
                },
              ],
            },
            "updateAttributesIfExists": true,
          },
          "handlerSpy": true,
          "locatorConfig": undefined,
          "logMessages": true,
          "messageSchemas": [],
          "messageTypeField": "myMessageType",
        }
      `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig(),
          messageTypeField: 'myMessageType',
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
        {
          "creationConfig": {
            "allowedSourceOwner": "test allowedSourceOwner",
            "forceTagUpdate": undefined,
            "queueUrlsWithSubscribePermissionsPrefix": [
              "arn:aws:sqs:*:*:test-*",
            ],
            "topic": {
              "Attributes": {
                "KmsMasterKeyId": "test kmsKeyId",
              },
              "Name": "test-first_entity",
              "Tags": [
                {
                  "Key": "env",
                  "Value": "dev",
                },
                {
                  "Key": "project",
                  "Value": "my-project",
                },
                {
                  "Key": "service",
                  "Value": "sns",
                },
                {
                  "Key": "lok-owner",
                  "Value": "team 1",
                },
                {
                  "Key": "lok-cost-system",
                  "Value": "my-system",
                },
                {
                  "Key": "lok-cost-service",
                  "Value": "service 1",
                },
              ],
            },
            "updateAttributesIfExists": undefined,
          },
          "handlerSpy": undefined,
          "locatorConfig": undefined,
          "logMessages": undefined,
          "messageSchemas": [],
          "messageTypeField": "myMessageType",
        }
      `)
      })
    })

    describe('external topics', () => {
      const topicName = EventRouting.topic2.topicName

      it('should work using all props', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig({ resourcePrefix: 'preffix' }),
          updateAttributesIfExists: true,
          messageTypeField: 'myMessageType',
          forceTagUpdate: true,
          logMessages: true,
          isTest: true,
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": undefined,
            "handlerSpy": true,
            "locatorConfig": {
              "topicName": "preffix_test-second_entity",
            },
            "logMessages": true,
            "messageSchemas": [],
            "messageTypeField": "myMessageType",
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig(),
          messageTypeField: 'myMessageType',
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": undefined,
            "handlerSpy": undefined,
            "locatorConfig": {
              "topicName": "test-second_entity",
            },
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeField": "myMessageType",
          }
        `)
      })
    })
  })
})
