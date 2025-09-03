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
