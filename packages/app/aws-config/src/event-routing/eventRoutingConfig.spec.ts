import { expectTypeOf } from 'vitest'
import type { EventRoutingConfig, QueueConfig, TopicConfig } from './eventRoutingConfig.ts'

describe('eventRoutingConfig', () => {
  describe('QueueConfig', () => {
    it('should use default generic types', () => {
      const queueConfig: QueueConfig = {
        name: 'my-queue',
        owner: 'my-team',
        service: 'my-service',
      }
      expectTypeOf(queueConfig).toEqualTypeOf<QueueConfig<string, string>>()
    })

    it('should use generic types', () => {
      const queueConfig: QueueConfig<'owner', 'service'> = {
        name: 'my-queue',
        owner: 'owner',
        service: 'service',
      }
      expectTypeOf(queueConfig).toEqualTypeOf<QueueConfig<'owner', 'service'>>()
      expectTypeOf(queueConfig).not.toEqualTypeOf<QueueConfig>()
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
            name: 'my-queue',
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
            name: 'my-queue',
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
              name: 'my-queue',
              owner: 'my-team',
              service: 'my-service',
            },
          },
        },
      } satisfies EventRoutingConfig

      expectTypeOf(config).toExtend<EventRoutingConfig<string, string, string>>()
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
              name: 'my-queue',
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
