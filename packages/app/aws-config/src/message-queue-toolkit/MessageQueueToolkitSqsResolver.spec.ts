import { beforeAll, expect } from 'vitest'
import { FakeLogger } from '../../tests/FakeLogger.ts'
import type { AwsConfig } from '../awsConfig.ts'
import type { CommandConfig } from './../event-routing/eventRoutingConfig.ts'
import { MessageQueueToolkitSqsOptionsResolver } from './MessageQueueToolkitSqsOptionsResolver.ts'

const project = 'test-project'
const config = {
  queue1: {
    queueName: 'test-project-mqt_queue-first_service',
    owner: 'team 1',
    service: 'service 1',
  },
  queue2: {
    queueName: 'test-project-mqt_queue-second_service',
    isExternal: true,
  },
} satisfies CommandConfig

const buildAwsConfig = (awsConfig?: Partial<AwsConfig>): AwsConfig => ({
  kmsKeyId: 'test kmsKeyId',
  allowedSourceOwner: '123456',
  region: 'test region',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  ...awsConfig,
})

const logger = new FakeLogger()

describe('MessageQueueToolkitSqsOptionsResolver', () => {
  let resolver: MessageQueueToolkitSqsOptionsResolver

  beforeAll(() => {
    resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
      system: 'my-system',
      project,
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
          project,
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
            project,
          }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Queue name must start with project name 'test-project': invalid]`,
      )
      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project,
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
            project,
          }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Queue name too long: ${longQueueName}. Max allowed length is 64, received ${longQueueName.length}]`,
      )
      expect(
        () =>
          new MessageQueueToolkitSqsOptionsResolver(config, {
            appEnv: 'development',
            system: 'test system',
            project,
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
            project,
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
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "123456",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "prefix_test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
                  "service": "sqs",
                },
              },
              "updateAttributesIfExists": true,
            },
            "handlerSpy": true,
            "locatorConfig": undefined,
            "logMessages": true,
            "messageSchemas": [],
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
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
              "forceTagUpdate": true,
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "123456",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
                  "service": "sqs",
                },
              },
              "updateAttributesIfExists": true,
            },
            "handlerSpy": undefined,
            "locatorConfig": undefined,
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
          }
        `)
      })

      it('should use default policy Principal if allowedSourceOwner is not set', () => {
        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig({ allowedSourceOwner: undefined }),
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": {
              "forceTagUpdate": true,
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "*",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
                  "service": "sqs",
                },
              },
              "updateAttributesIfExists": true,
            },
            "handlerSpy": undefined,
            "locatorConfig": undefined,
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
          }
        `)
      })

      it('should use default policy Principal if allowedSourceOwner is empty', () => {
        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig({ allowedSourceOwner: '   ' }),
          messageSchemas: [],
        })

        expect(result).toMatchInlineSnapshot(`
          {
            "creationConfig": {
              "forceTagUpdate": true,
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "*",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
                  "service": "sqs",
                },
              },
              "updateAttributesIfExists": true,
            },
            "handlerSpy": undefined,
            "locatorConfig": undefined,
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
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
              "queueName": "prefix_test-project-mqt_queue-second_service",
              "startupResourcePolling": {
                "enabled": false,
                "nonBlocking": true,
                "pollingIntervalMs": 5000,
                "throwOnTimeout": false,
                "timeoutMs": Symbol(NO_TIMEOUT),
              },
            },
            "logMessages": true,
            "messageSchemas": [],
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
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
              "queueName": "test-project-mqt_queue-second_service",
              "startupResourcePolling": {
                "enabled": true,
                "nonBlocking": true,
                "pollingIntervalMs": 5000,
                "throwOnTimeout": false,
                "timeoutMs": Symbol(NO_TIMEOUT),
              },
            },
            "logMessages": undefined,
            "messageSchemas": [],
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
          }
        `)
      })

      it.each([
        'production',
        'staging',
      ] as const)('should use %s startupResourcePolling config', (appEnv) => {
        const nonDevResolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv,
        })

        const result = nonDevResolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
        })

        expect(result.locatorConfig?.startupResourcePolling).toEqual({
          enabled: true,
          nonBlocking: true,
          pollingIntervalMs: 30000,
          throwOnTimeout: false,
          timeoutMs: 300000,
        })
      })
    })

    describe('forceTagUpdate behavior', () => {
      const queueName = config.queue1.queueName

      it.each([
        'development',
        'staging',
        'production',
      ] as const)('should default to true in development environment and false for others, env: %s', (appEnv) => {
        const resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv,
        })

        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
        })

        expect(result.creationConfig?.forceTagUpdate).toBe(appEnv === 'development')
      })

      it('should respect explicit true value regardless of environment', () => {
        const resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv: 'production',
        })

        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
          forceTagUpdate: true,
        })

        expect(result.creationConfig?.forceTagUpdate).toBe(true)
      })

      it('should respect explicit false value regardless of environment', () => {
        const resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv: 'development',
        })

        const result = resolver.resolvePublisherOptions(queueName, {
          awsConfig: buildAwsConfig(),
          messageSchemas: [],
          forceTagUpdate: false,
        })

        expect(result.creationConfig?.forceTagUpdate).toBe(false)
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
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "123456",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "prefix_test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
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
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
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
              "forceTagUpdate": true,
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "123456",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
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
                  "QueueName": "test-project-mqt_queue-first_service-dlq",
                  "tags": {
                    "env": "dev",
                    "lok-cost-service": "service 1",
                    "lok-cost-system": "my-system",
                    "lok-owner": "team 1",
                    "project": "test-project",
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
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
          }
        `)
      })

      it('should use default policy Principal if allowedSourceOwner is not set', () => {
        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
          awsConfig: buildAwsConfig({ allowedSourceOwner: undefined }),
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
              "forceTagUpdate": true,
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "*",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
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
                  "QueueName": "test-project-mqt_queue-first_service-dlq",
                  "tags": {
                    "env": "dev",
                    "lok-cost-service": "service 1",
                    "lok-cost-system": "my-system",
                    "lok-owner": "team 1",
                    "project": "test-project",
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
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
          }
        `)
      })

      it('should use default policy Principal if allowedSourceOwner is empty', () => {
        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
          awsConfig: buildAwsConfig({ allowedSourceOwner: '    ' }),
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
              "forceTagUpdate": true,
              "policyConfig": {
                "resource": Symbol(current_queue),
                "statements": {
                  "Action": [
                    "sqs:SendMessage",
                    "sqs:GetQueueAttributes",
                    "sqs:GetQueueUrl",
                  ],
                  "Effect": "Allow",
                  "Principal": "*",
                },
              },
              "queue": {
                "Attributes": {
                  "KmsMasterKeyId": "test kmsKeyId",
                  "VisibilityTimeout": "60",
                },
                "QueueName": "test-project-mqt_queue-first_service",
                "tags": {
                  "env": "dev",
                  "lok-cost-service": "service 1",
                  "lok-cost-system": "my-system",
                  "lok-owner": "team 1",
                  "project": "test-project",
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
                  "QueueName": "test-project-mqt_queue-first_service-dlq",
                  "tags": {
                    "env": "dev",
                    "lok-cost-service": "service 1",
                    "lok-cost-system": "my-system",
                    "lok-owner": "team 1",
                    "project": "test-project",
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
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
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
              "queueName": "prefix_test-project-mqt_queue-second_service",
              "startupResourcePolling": {
                "enabled": false,
                "nonBlocking": true,
                "pollingIntervalMs": 5000,
                "throwOnTimeout": false,
                "timeoutMs": Symbol(NO_TIMEOUT),
              },
            },
            "logMessages": true,
            "maxRetryDuration": 172800,
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
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
              "queueName": "test-project-mqt_queue-second_service",
              "startupResourcePolling": {
                "enabled": true,
                "nonBlocking": true,
                "pollingIntervalMs": 5000,
                "throwOnTimeout": false,
                "timeoutMs": Symbol(NO_TIMEOUT),
              },
            },
            "logMessages": undefined,
            "maxRetryDuration": 172800,
            "messageTypeResolver": {
              "messageTypePath": "type",
            },
          }
        `)
      })

      it.each([
        'production',
        'staging',
      ] as const)('should use %s startupResourcePolling config', (appEnv) => {
        const nonDevResolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv,
        })

        const result = nonDevResolver.resolveConsumerOptions(queueName, {
          logger,
          handlers: [],
          awsConfig: buildAwsConfig(),
        })

        expect(result.locatorConfig?.startupResourcePolling).toEqual({
          enabled: true,
          nonBlocking: true,
          pollingIntervalMs: 30000,
          throwOnTimeout: false,
          timeoutMs: 300000,
        })
      })
    })

    describe('forceTagUpdate behavior', () => {
      const queueName = config.queue1.queueName

      it.each([
        'development',
        'staging',
        'production',
      ] as const)('should default to true in development environment and false for others, env: %s', (appEnv) => {
        const resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv,
        })

        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
          awsConfig: buildAwsConfig(),
          handlers: [],
        })

        expect(result.creationConfig?.forceTagUpdate).toBe(appEnv === 'development')
      })

      it('should respect explicit true value regardless of environment', () => {
        const resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv: 'production',
        })

        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
          awsConfig: buildAwsConfig(),
          handlers: [],
          forceTagUpdate: true,
        })

        expect(result.creationConfig?.forceTagUpdate).toBe(true)
      })

      it('should respect explicit false value regardless of environment', () => {
        const resolver = new MessageQueueToolkitSqsOptionsResolver(config, {
          system: 'my-system',
          project,
          appEnv: 'development',
        })

        const result = resolver.resolveConsumerOptions(queueName, {
          logger,
          awsConfig: buildAwsConfig(),
          handlers: [],
          forceTagUpdate: false,
        })

        expect(result.creationConfig?.forceTagUpdate).toBe(false)
      })
    })
  })
})
