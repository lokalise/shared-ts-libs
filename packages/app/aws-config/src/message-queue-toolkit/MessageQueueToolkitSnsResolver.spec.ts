import { CONSUMER_BASE_MESSAGE_SCHEMA } from '@message-queue-toolkit/core'
import { beforeAll, expect } from 'vitest'
import { FakeLogger } from '../../tests/FakeLogger.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { EventRoutingConfig } from './../event-routing/eventRoutingConfig.ts'
import { MessageQueueToolkitSnsOptionsResolver } from './MessageQueueToolkitSnsOptionsResolver.ts'

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

const logger = new FakeLogger()

describe('MessageQueueToolkitSnsOptionsResolver', () => {
  let resolver: MessageQueueToolkitSnsOptionsResolver

  beforeAll(() => {
    resolver = new MessageQueueToolkitSnsOptionsResolver(EventRouting, {
      system: 'my-system',
      project: 'my-project',
      appEnv: 'development',
    })
  })

  describe('constructor', () => {
    it('should create an instance of MessageQueueToolkitSnsOptionsResolver for empty event routing', () => {
      const resolver = new MessageQueueToolkitSnsOptionsResolver(
        {},
        {
          validateNamePatterns: true,
          appEnv: 'development',
          system: 'test system',
          project: 'test project',
        },
      )
      expect(resolver).toBeInstanceOf(MessageQueueToolkitSnsOptionsResolver)
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
          new MessageQueueToolkitSnsOptionsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid topic name: invalid]')

      expect(
        () =>
          new MessageQueueToolkitSnsOptionsResolver(config, {
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
          new MessageQueueToolkitSnsOptionsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid queue name: invalid]')
      expect(
        () =>
          new MessageQueueToolkitSnsOptionsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })

    it('should work with a valid event routing config', () => {
      expect(
        () =>
          new MessageQueueToolkitSnsOptionsResolver(EventRouting, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })
  })

  describe('resolvePublisherBuildOptions', () => {
    it('should throw an error if topic name is not found', () => {
      expect(() =>
        resolver.resolvePublisherBuildOptions({
          topicName: 'invalid-topic',
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
        }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Topic invalid-topic not found]')
    })

    describe('internal topics', () => {
      const topicName = EventRouting.topic1.topicName

      it('should work using all properties', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig({ resourcePrefix: 'preffix' }),
          updateAttributesIfExists: true,
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
            "messageTypeField": "type",
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig(),
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
              "updateAttributesIfExists": true,
            },
            "handlerSpy": undefined,
            "locatorConfig": undefined,
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeField": "type",
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
            "messageTypeField": "type",
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolvePublisherBuildOptions({
          topicName,
          awsConfig: buildAwsConfig(),
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
            "messageTypeField": "type",
          }
        `)
      })
    })
  })

  describe('resolveConsumerBuildOptions', () => {
    it('should throw an error if topic name is not found', () => {
      expect(() =>
        resolver.resolveConsumerBuildOptions({
          logger,
          topicName: 'invalid-topic',
          queueName: 'test-first_entity-first_service',
          awsConfig: buildAwsConfig(),
          handlers: [],
        }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Topic invalid-topic not found]')
    })

    it('should throw an error if queue is not defined for given topic', () => {
      expect(() =>
        resolver.resolveConsumerBuildOptions({
          logger,
          topicName: EventRouting.topic1.topicName,
          queueName: EventRouting.topic2.queues.topic2Queue1.name,
          awsConfig: buildAwsConfig(),
          handlers: [],
        }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Queue test-second_entity-service not found]')
    })

    it('should properly use handlers', () => {
      const options = resolver.resolveConsumerBuildOptions({
        logger,
        topicName: EventRouting.topic1.topicName,
        queueName: EventRouting.topic1.queues.topic1Queue1.name,
        awsConfig: buildAwsConfig(),
        handlers: [
          {
            schema: CONSUMER_BASE_MESSAGE_SCHEMA,
            handler: () => Promise.resolve({ result: 'success' }),
            preHandlers: [],
            messageLogFormatter: () => undefined,
          },
        ],
      })

      expect(options.handlers).toHaveLength(1)
      expect(options.handlers[0]!.preHandlers).toHaveLength(1)
      expect(options.subscriptionConfig).toMatchInlineSnapshot(`
        {
          "Attributes": {
            "FilterPolicy": "{"type":["<replace.me>"]}",
            "FilterPolicyScope": "MessageBody",
          },
          "updateAttributesIfExists": true,
        }
      `)
    })

    describe('internal topics', () => {
      const topicName = EventRouting.topic1.topicName
      const queueName = EventRouting.topic1.queues.topic1Queue1.name

      it('should work using all properties', () => {
        const result = resolver.resolveConsumerBuildOptions({
          topicName,
          queueName,
          logger,
          handlers: [],
          awsConfig: buildAwsConfig({ resourcePrefix: 'preffix' }),
          updateAttributesIfExists: true,
          forceTagUpdate: true,
          logMessages: true,
          isTest: true,
          batchSize: 1,
          concurrentConsumersAmount: 1,
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "concurrentConsumersAmount": 1,
            "consumerOverrides": {
              "batchSize": 1,
              "terminateVisibilityTimeout": true,
            },
            "creationConfig": {
              "allowedSourceOwner": "test allowedSourceOwner",
              "forceTagUpdate": true,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "preffix_test-first_entity-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "my-project",
                  "service": "sqs",
                },
              },
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
              "topicArnsWithPublishPermissionsPrefix": "arn:aws:sns:*:*:preffix_test-*",
              "updateAttributesIfExists": true,
            },
            "deadLetterQueue": undefined,
            "deletionConfig": {
              "deleteIfExists": true,
            },
            "handlerSpy": true,
            "handlers": [],
            "locatorConfig": undefined,
            "logMessages": true,
            "maxRetryDuration": 172800,
            "messageTypeField": "type",
            "subscriptionConfig": {
              "Attributes": {
                "FilterPolicy": "{"type":[]}",
                "FilterPolicyScope": "MessageBody",
              },
              "updateAttributesIfExists": true,
            },
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolveConsumerBuildOptions({
          logger,
          topicName,
          queueName,
          awsConfig: buildAwsConfig(),
          handlers: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "concurrentConsumersAmount": undefined,
            "consumerOverrides": {
              "batchSize": undefined,
              "heartbeatInterval": 20,
            },
            "creationConfig": {
              "allowedSourceOwner": "test allowedSourceOwner",
              "forceTagUpdate": undefined,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-first_entity-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "my-project",
                  "service": "sqs",
                },
              },
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
              "topicArnsWithPublishPermissionsPrefix": "arn:aws:sns:*:*:test-*",
              "updateAttributesIfExists": true,
            },
            "deadLetterQueue": {
              "creationConfig": {
                "queue": {
                  "Attributes": {
                    "KmsMasterKeyId": "test kmsKeyId",
                    "MessageRetentionPeriod": "604800",
                  },
                  "QueueName": "test-first_entity-first_service-dlq",
                  "tags": {
                    "env": "dev",
                    "lok-cost-service": "service 1",
                    "lok-cost-system": "my-system",
                    "lok-owner": "team 1",
                    "project": "my-project",
                    "service": "sqs",
                  },
                },
                "updateAttributesIfExists": true,
              },
              "redrivePolicy": {
                "maxReceiveCount": 5,
              },
            },
            "deletionConfig": {
              "deleteIfExists": undefined,
            },
            "handlerSpy": undefined,
            "handlers": [],
            "locatorConfig": undefined,
            "logMessages": undefined,
            "maxRetryDuration": 172800,
            "messageTypeField": "type",
            "subscriptionConfig": {
              "Attributes": {
                "FilterPolicy": "{"type":[]}",
                "FilterPolicyScope": "MessageBody",
              },
              "updateAttributesIfExists": true,
            },
          }
        `)
      })
    })

    describe('external topics', () => {
      const topicName = EventRouting.topic2.topicName
      const queueName = EventRouting.topic2.queues.topic2Queue1.name

      it('should work using all props', () => {
        const result = resolver.resolveConsumerBuildOptions({
          logger,
          topicName,
          queueName,
          handlers: [],
          awsConfig: buildAwsConfig({ resourcePrefix: 'preffix' }),
          updateAttributesIfExists: true,
          forceTagUpdate: true,
          logMessages: true,
          isTest: true,
          batchSize: 1,
          concurrentConsumersAmount: 1,
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "concurrentConsumersAmount": 1,
            "consumerOverrides": {
              "batchSize": 1,
              "terminateVisibilityTimeout": true,
            },
            "creationConfig": {
              "allowedSourceOwner": "test allowedSourceOwner",
              "forceTagUpdate": true,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "preffix_test-second_entity-service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 2",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "my-project",
                  "service": "sqs",
                },
              },
              "queueUrlsWithSubscribePermissionsPrefix": undefined,
              "topic": undefined,
              "topicArnsWithPublishPermissionsPrefix": "arn:aws:sns:*:*:preffix_test-*",
              "updateAttributesIfExists": true,
            },
            "deadLetterQueue": undefined,
            "deletionConfig": {
              "deleteIfExists": true,
            },
            "handlerSpy": true,
            "handlers": [],
            "locatorConfig": {
              "topicName": "preffix_test-second_entity",
            },
            "logMessages": true,
            "maxRetryDuration": 172800,
            "messageTypeField": "type",
            "subscriptionConfig": {
              "Attributes": {
                "FilterPolicy": "{"type":[]}",
                "FilterPolicyScope": "MessageBody",
              },
              "updateAttributesIfExists": true,
            },
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolveConsumerBuildOptions({
          topicName,
          queueName,
          logger,
          handlers: [],
          awsConfig: buildAwsConfig(),
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "concurrentConsumersAmount": undefined,
            "consumerOverrides": {
              "batchSize": undefined,
              "heartbeatInterval": 20,
            },
            "creationConfig": {
              "allowedSourceOwner": "test allowedSourceOwner",
              "forceTagUpdate": undefined,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-second_entity-service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 2",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "my-project",
                  "service": "sqs",
                },
              },
              "queueUrlsWithSubscribePermissionsPrefix": undefined,
              "topic": undefined,
              "topicArnsWithPublishPermissionsPrefix": "arn:aws:sns:*:*:test-*",
              "updateAttributesIfExists": true,
            },
            "deadLetterQueue": {
              "creationConfig": {
                "queue": {
                  "Attributes": {
                    "KmsMasterKeyId": "test kmsKeyId",
                    "MessageRetentionPeriod": "604800",
                  },
                  "QueueName": "test-second_entity-service-dlq",
                  "tags": {
                    "env": "dev",
                    "lok-cost-service": "service 2",
                    "lok-cost-system": "my-system",
                    "lok-owner": "team 1",
                    "project": "my-project",
                    "service": "sqs",
                  },
                },
                "updateAttributesIfExists": true,
              },
              "redrivePolicy": {
                "maxReceiveCount": 5,
              },
            },
            "deletionConfig": {
              "deleteIfExists": undefined,
            },
            "handlerSpy": undefined,
            "handlers": [],
            "locatorConfig": {
              "topicName": "test-second_entity",
            },
            "logMessages": undefined,
            "maxRetryDuration": 172800,
            "messageTypeField": "type",
            "subscriptionConfig": {
              "Attributes": {
                "FilterPolicy": "{"type":[]}",
                "FilterPolicyScope": "MessageBody",
              },
              "updateAttributesIfExists": true,
            },
          }
        `)
      })
    })
  })
})
