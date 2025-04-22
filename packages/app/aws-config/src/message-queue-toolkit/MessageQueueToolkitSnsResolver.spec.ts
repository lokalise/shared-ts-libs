import type { EventRoutingConfig } from './../event-routing/eventRoutingConfig.ts'
import { MessageQueueToolkitSnsResolver } from './MessageQueueToolkitSnsResolver.ts'

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

describe('MessageQueueToolkitSnsResolver', () => {
  describe('constructor', () => {
    it('should create an instance of MessageQueueToolkitSnsResolver for empty event routing', () => {
      const resolver = new MessageQueueToolkitSnsResolver({}, { validateNamePatterns: true })
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
        () => new MessageQueueToolkitSnsResolver(config, { validateNamePatterns: true }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid topic name: invalid]')

      expect(() => new MessageQueueToolkitSnsResolver(config)).not.toThrowError()
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
        () => new MessageQueueToolkitSnsResolver(config, { validateNamePatterns: true }),
      ).toThrowErrorMatchingInlineSnapshot('[Error: Invalid queue name: invalid]')
      expect(() => new MessageQueueToolkitSnsResolver(config)).not.toThrowError()
    })

    it('should work with a valid event routing config', () => {
      expect(
        () =>
          new MessageQueueToolkitSnsResolver(EventRouting, {
            validateNamePatterns: true,
          }),
      ).not.toThrowError()
    })
  })
})
