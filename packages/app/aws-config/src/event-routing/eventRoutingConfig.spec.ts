import { expectTypeOf } from 'vitest'
import type {
  CommandConfig,
  EventRoutingConfig,
  ExternalQueueConfig,
  InternalQueueConfig,
  QueueConfig,
  TopicConfig,
} from './eventRoutingConfig.ts'

describe('eventRoutingConfig', () => {
  describe('QueueConfig', () => {
    describe('InternalQueueConfig', () => {
      it('should use default generic types', () => {
        const queueConfig: QueueConfig = {
          queueName: 'my-queue',
          owner: 'my-team',
          service: 'my-service',
        }
        expectTypeOf(queueConfig).toEqualTypeOf<InternalQueueConfig>()
        expectTypeOf(queueConfig).not.toEqualTypeOf<ExternalQueueConfig>()
      })

      it('should use generic types', () => {
        const queueConfig: QueueConfig<'owner', 'service'> = {
          queueName: 'my-queue',
          owner: 'owner',
          service: 'service',
        }
        expectTypeOf(queueConfig).toEqualTypeOf<InternalQueueConfig<'owner', 'service'>>()
        expectTypeOf(queueConfig).not.toEqualTypeOf<ExternalQueueConfig>()
        expectTypeOf(queueConfig).not.toEqualTypeOf<InternalQueueConfig>()
      })
    })

    describe('ExternalQueueConfig', () => {
      it('should use default generic types', () => {
        const queueConfig: QueueConfig = {
          queueName: 'my-queue',
          isExternal: true,
        }
        expectTypeOf(queueConfig).toEqualTypeOf<ExternalQueueConfig>()
        expectTypeOf(queueConfig).not.toEqualTypeOf<InternalQueueConfig>()
      })

      it('should use generic types', () => {
        const queueConfig: QueueConfig<'owner', 'service'> = {
          queueName: 'my-queue',
          isExternal: true,
        }
        expectTypeOf(queueConfig).toEqualTypeOf<ExternalQueueConfig>()
        expectTypeOf(queueConfig).not.toEqualTypeOf<InternalQueueConfig<'owner', 'service'>>()
      })

      it('should not allow owner or service', () => {
        const validConfig = {
          queueName: 'my-queue',
          isExternal: true,
        } satisfies QueueConfig
        expectTypeOf(validConfig).toExtend<QueueConfig>()

        const configWithOwner = { ...validConfig, owner: 'my-team' }
        expectTypeOf(configWithOwner).not.toExtend<QueueConfig>()

        const configWithService = { ...validConfig, service: 'my-service' }
        expectTypeOf(configWithService).not.toExtend<QueueConfig>()
      })
    })
  })

  describe('CommandConfig', () => {
    it('should use default generic types', () => {
      const config = {
        myCommand: {
          queueName: 'my-queue',
          owner: 'my-team',
          service: 'my-service',
        },
        anotherCommand: {
          queueName: 'external-queue',
          isExternal: true,
        },
      } satisfies CommandConfig

      expectTypeOf(config).toExtend<CommandConfig>()
      expectTypeOf(config.myCommand).toExtend<InternalQueueConfig>()
      expectTypeOf(config.anotherCommand).toExtend<ExternalQueueConfig>()
    })

    it('should respect generic types', () => {
      const config = {
        myCommand: {
          queueName: 'my-queue',
          owner: 'owner',
          service: 'service',
        },
        anotherCommand: {
          queueName: 'external-queue',
          isExternal: true,
        },
      } satisfies CommandConfig<'owner', 'service'>

      expectTypeOf(config).toExtend<CommandConfig<'owner', 'service'>>()
      expectTypeOf(config.myCommand).toExtend<InternalQueueConfig<'owner', 'service'>>()
      expectTypeOf(config.anotherCommand).toExtend<ExternalQueueConfig>()
    })
  })

  describe('TopicConfig', () => {
    it('should use default generic types', () => {
      const topicConfig = {
        topicName: 'my-topic',
        owner: 'my-team',
        service: 'my-service',
        queues: {
          myQueue: {
            queueName: 'my-queue',
            owner: 'my-team',
            service: 'my-service',
          },
        },
      } satisfies TopicConfig

      expectTypeOf(topicConfig).toExtend<TopicConfig<string, string>>()
    })

    it('should respect generic types', () => {
      const topicConfig = {
        topicName: 'my-topic',
        owner: 'owner',
        service: 'service',
        externalAppsWithSubscribePermissions: ['another-app'],
        queues: {
          myQueue: {
            queueName: 'my-queue',
            owner: 'owner',
            service: 'service',
          },
        },
      } satisfies TopicConfig<'owner', 'service', 'another-app'>

      expectTypeOf(topicConfig).toExtend<TopicConfig<'owner', 'service', 'another-app'>>()
    })

    it('should allow minimal config for external topics', () => {
      const validMinimalConfig = {
        topicName: 'my-external-topic',
        isExternal: true,
        queues: {},
      } satisfies TopicConfig<'owner', 'service', 'app'>
      expectTypeOf(validMinimalConfig).toExtend<TopicConfig<'owner', 'service', 'app'>>()

      const configWithOwner = {
        ...validMinimalConfig,
        owner: 'my-team',
      }
      expectTypeOf(configWithOwner).not.toExtend<TopicConfig>()

      const configWithService = {
        ...validMinimalConfig,
        service: 'my-service',
      }
      expectTypeOf(configWithService).not.toExtend<TopicConfig>()

      const configWithExternalApps = {
        ...validMinimalConfig,
        externalAppsWithSubscribePermissions: ['my app'],
      }
      expectTypeOf(configWithExternalApps).not.toExtend<TopicConfig>()
    })

    it('should not allow external queues on internal topics', () => {
      const validTopicConfig = {
        topicName: 'my-topic',
        owner: 'owner',
        service: 'service',
        queues: {
          myQueue: {
            queueName: 'my-queue',
            owner: 'owner',
            service: 'service',
          },
        },
      } satisfies TopicConfig<'owner', 'service'>
      expectTypeOf(validTopicConfig).toExtend<TopicConfig<'owner', 'service'>>()
      expectTypeOf(validTopicConfig.queues.myQueue).toExtend<
        InternalQueueConfig<'owner', 'service'>
      >()

      const topicWithExternalQueue = {
        ...validTopicConfig,
        queues: {
          ...validTopicConfig.queues,
          myExternalQueue: {
            queueName: 'my-external-queue',
            isExternal: true as const,
          },
        },
      }
      expectTypeOf(topicWithExternalQueue).not.toExtend<TopicConfig<'owner', 'service'>>()
    })

    it('should allow external queues on external topics', () => {
      const topicConfig = {
        topicName: 'my-external-topic',
        isExternal: true,
        queues: {
          myQueue: {
            queueName: 'my-queue',
            owner: 'owner',
            service: 'service',
          },
          myExternalQueue: {
            queueName: 'my-external-queue',
            isExternal: true,
          },
        },
      } satisfies TopicConfig<'owner', 'service'>

      expectTypeOf(topicConfig).toExtend<TopicConfig<'owner', 'service'>>()
      expectTypeOf(topicConfig.queues.myQueue).toExtend<InternalQueueConfig<'owner', 'service'>>()
      expectTypeOf(topicConfig.queues.myExternalQueue).toExtend<ExternalQueueConfig>()
    })

    it('should not allow owner or service on external queues', () => {
      const validTopicConfig = {
        topicName: 'my-external-topic',
        isExternal: true,
        queues: {
          myExternalQueue: {
            queueName: 'my-external-queue',
            isExternal: true,
          },
        },
      } satisfies TopicConfig
      expectTypeOf(validTopicConfig).toExtend<TopicConfig>()

      const queueWithOwner = {
        ...validTopicConfig,
        queues: {
          myExternalQueue: { ...validTopicConfig.queues.myExternalQueue, owner: 'my-team' },
        },
      }
      expectTypeOf(queueWithOwner).not.toExtend<TopicConfig>()

      const queueWithService = {
        ...validTopicConfig,
        queues: {
          myExternalQueue: { ...validTopicConfig.queues.myExternalQueue, service: 'my-service' },
        },
      }
      expectTypeOf(queueWithService).not.toExtend<TopicConfig>()
    })
  })

  describe('EventRoutingConfig', () => {
    it('should use default generic types', () => {
      const config = {
        myTopic: {
          topicName: 'my-topic',
          owner: 'my-team',
          service: 'my-service',
          queues: {
            myQueue: {
              queueName: 'my-queue',
              owner: 'my-team',
              service: 'my-service',
            },
          },
        },
      } satisfies EventRoutingConfig

      expectTypeOf(config).toExtend<EventRoutingConfig>()
    })

    it('should respect generic types', () => {
      const config = {
        myTopic: {
          topicName: 'my-topic',
          owner: 'owner',
          service: 'service',
          externalAppsWithSubscribePermissions: ['another-app'],
          queues: {
            myQueue: {
              queueName: 'my-queue',
              owner: 'owner',
              service: 'service',
            },
          },
        },
      } satisfies EventRoutingConfig<'owner', 'service', 'another-app'>

      expectTypeOf(config).toExtend<EventRoutingConfig<'owner', 'service', 'another-app'>>()
    })
  })
})
