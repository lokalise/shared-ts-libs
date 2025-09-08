import { beforeAll, expect } from 'vitest'
import { FakeLogger } from '../../tests/FakeLogger.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { CommandConfig } from './../event-routing/eventRoutingConfig.ts'
import { MessageQueueToolkitSqsOptionsResolver } from './MessageQueueToolkitSqsOptionsResolver.ts'

const config = {
  queue1: {
    queueName: 'test-mqt-queue_first',
    owner: 'team 1',
    service: 'service 1',
  },
  queue2: {
    queueName: 'test-mqt-queue_second',
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

  describe('resolvePublisherOptions', () => {
    it('should throw an error if queue name is not found', () => {
      expect(() =>
        resolver.resolvePublisherOptions('invalid-queue', {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`[Error: Queue invalid-queue not found]`)
    })

    describe('internal queues', () => {
      const queueName = config.queue1.queueName

      it('should work using all props', () => {
        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig({ resourcePrefix: 'prefix' }),
          updateAttributesIfExists: true,
          forceTagUpdate: true,
          logMessages: true,
          isTest: true,
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": {
              "forceTagUpdate": true,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "Policy": "{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},"Action":["sqs:SendMessage","sqs:GetQueueAttributes","sqs:GetQueueUrl"]}]}",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "prefix_test-mqt-queue_first",
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
            "handlerSpy": true,
            "locatorConfig": undefined,
            "logMessages": true,
            "messageSchemas": [],
            "messageTypeField": "type",
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": {
              "forceTagUpdate": undefined,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "Policy": "{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},"Action":["sqs:SendMessage","sqs:GetQueueAttributes","sqs:GetQueueUrl"]}]}",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-mqt-queue_first",
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
            "handlerSpy": undefined,
            "locatorConfig": undefined,
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeField": "type",
          }
        `)
      })
    })

    describe('external queues', () => {
      const queueName = config.queue2.queueName

      it('should work using all props', () => {
        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig({ resourcePrefix: 'prefix' }),
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
              "queueName": "prefix_test-mqt-queue_second",
            },
            "logMessages": true,
            "messageSchemas": [],
            "messageTypeField": "type",
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": undefined,
            "handlerSpy": undefined,
            "locatorConfig": {
              "queueName": "test-mqt-queue_second",
            },
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeField": "type",
          }
        `)
      })
    })
  })

  describe('resolveConsumerOptions', () => {
    it('should throw an error if queue name is not found', () => {
      expect(() =>
        resolver.resolveConsumerOptions('invalid', {
          logger,
          awsConfig: buildAwsConfig(),
          handlers: [],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`[Error: Queue invalid not found]`)
    })

    describe('internal queue', () => {
      const queueName = config.queue1.queueName

      it('should work using all properties', () => {
        const result = resolver.resolveConsumerOptions(queueName, {
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
              "forceTagUpdate": true,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "Policy": "{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},"Action":["sqs:SendMessage","sqs:GetQueueAttributes","sqs:GetQueueUrl"]}]}",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "prefix_test-mqt-queue_first",
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
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
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
              "forceTagUpdate": undefined,
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "Policy": "{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},"Action":["sqs:SendMessage","sqs:GetQueueAttributes","sqs:GetQueueUrl"]}]}",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-mqt-queue_first",
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
            "deadLetterQueue": {
              "creationConfig": {
                "queue": {
                  "Attributes": {
                    "KmsMasterKeyId": "test kmsKeyId",
                    "MessageRetentionPeriod": "604800",
                  },
                  "QueueName": "test-mqt-queue_first-dlq",
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
          }
        `)
      })
    })

    describe('external queue', () => {
      const queueName = config.queue2.queueName

      it('should work using all properties', () => {
        const result = resolver.resolveConsumerOptions(queueName, {
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
            "creationConfig": undefined,
            "deadLetterQueue": undefined,
            "deletionConfig": {
              "deleteIfExists": true,
            },
            "handlerSpy": true,
            "handlers": [],
            "locatorConfig": {
              "queueName": "prefix_test-mqt-queue_second",
            },
            "logMessages": true,
            "maxRetryDuration": 172800,
            "messageTypeField": "type",
          }
        `)
      })

      it('should work using only required props', () => {
        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
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
            "creationConfig": undefined,
            "deadLetterQueue": undefined,
            "deletionConfig": {
              "deleteIfExists": undefined,
            },
            "handlerSpy": undefined,
            "handlers": [],
            "locatorConfig": {
              "queueName": "test-mqt-queue_second",
            },
            "logMessages": undefined,
            "maxRetryDuration": 172800,
            "messageTypeField": "type",
          }
        `)
      })
    })
  })
})
