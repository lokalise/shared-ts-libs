import { CONSUMER_BASE_MESSAGE_SCHEMA } from '@message-queue-toolkit/core'
import { beforeAll, expect } from 'vitest'
import { FakeLogger } from '../../tests/FakeLogger.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { CommandConfig } from './../event-routing/eventRoutingConfig.ts'
import { MessageQueueToolkitSqsOptionsResolver } from './MessageQueueToolkitSqsOptionsResolver.js'

const config = {
  queue1: {
    queueName: 'test-queue1',
    owner: 'team 1',
    service: 'service 1',
  },
  queue2: {
    queueName: 'test-queue2',
    isExternal: true,
  },
} satisfies CommandConfig

const buildAwsConfig = (awsConfig?: Partial<AwsConfig>): AwsConfig => ({
  kmsKeyId: 'test kmsKeyId',
  allowedSourceOwner: 'test allowedSourceOwner',
  region: 'test region',
  ...awsConfig,
})

const logger = new FakeLogger()

describe('MessageQueueToolkitSqsOptionsResolver', () => {
  let resolver: MessageQueueToolkitSqsOptionsResolver

  beforeAll(() => {
    resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
      system: 'my-system',
      project: 'my-project',
      appEnv: 'development',
    })
  })

  describe('constructor', () => {
    it('should create an instance of MessageQueueToolkitSqsOptionsResolver for empty command config', () => {
      const resolver = new MessageQueueToolkitSqsOptionsResolver(
        {},
        {
          validateNamePatterns: true,
          appEnv: 'development',
          system: 'test system',
          project: 'test project',
        },
      )
      expect(resolver).toBeInstanceOf(MessageQueueToolkitSqsOptionsResolver)
    })

    it('should throw an error if queue name pattern is invalid', () => {
      const config = {
        test: {
          queueName: 'invalid',
          owner: 'test',
          service: 'test',
        },
      } satisfies CommandConfig

      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid queue name: invalid]')
      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })

    it('should throw an error if queue name is too long', () => {
      const longQueueName = `long-queue_name-${'a'.repeat(49)}` // 65 characters long
      const config = {
        invalid: {
          queueName: longQueueName,
          owner: 'test',
          service: 'test',
        },
      } satisfies CommandConfig

      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Queue name too long: ${longQueueName}. Max allowed length is 64, received ${longQueueName.length}]`,
      )
      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })

    it('should work with a valid command config', () => {
      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            validateNamePatterns: true,
            appEnv: 'development',
            system: 'test system',
            project: 'test project',
          }),
      ).not.toThrowError()
    })
  })

  describe('resolveConsumerBuildOptions', () => {
    it('should throw an error if queue name is not found', () => {
      expect(() =>
        resolver.resolveConsumerBuildOptions({
          logger,
          queueName: 'invalid',
          awsConfig: buildAwsConfig(),
          handlers: [],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`[Error: Queue invalid not found]`)
    })

    describe('internal topics', () => {
      const queueName = config.queue1.queueName

      it('should work using all properties', () => {
        const result = resolver.resolveConsumerBuildOptions({
          queueName,
          logger,
          handlers: [],
          awsConfig: buildAwsConfig({ resourcePrefix: 'prefix' }),
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
                "QueueName": "prefix_test-first_entity-first_service",
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
                "arn:aws:sqs:*:*:prefix_test-*",
              ],
              "topic": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                },
                "Name": "prefix_test-first_entity",
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
              "topicArnsWithPublishPermissionsPrefix": "arn:aws:sns:*:*:prefix_test-*",
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
      const queueName = config.queue2.queueName

      it('should throw an error', () => {
        expect(() =>
          resolver.resolveConsumerBuildOptions({
            logger,
            queueName,
            awsConfig: buildAwsConfig(),
            handlers: [],
          }),
        ).toThrowErrorMatchingInlineSnapshot(`[Error: SQS Consumer can only be created for non-external queues]`)
      })
    })
  })
})
