import { QUEUE_NAME_REGEX, TOPIC_NAME_REGEX } from './regex.ts'

describe('regex', () => {
  describe('TOPIC_NAME_REGEX', () => {
    it.each(['foo-bar', 'one_two-three_four'])('should match regex (%s)', (name) => {
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
      'foo-bar-baz', // too many sections (three parts)
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
      'system-flow-service',
      'my_system-main_flow-main_service',
      'a-b-c',
      'sys_name-flow_name-service_name',
      'one_two-three_four-five_six',
    ])('should match regex (%s)', (name) => {
      expect(QUEUE_NAME_REGEX.test(name)).toBe(true)
    })

    it.each([
      // too few sections
      'system-flow',
      'queue',

      // too many sections
      'a-b-c-d',
      'foo-bar-baz-qux',

      // invalid characters
      'system1-flow-service', // number in first section
      'system-flow1-service', // number in second section
      'system-flow-service1', // number in third section
      'System-flow-service', // uppercase
      'system-Flow-service', // uppercase
      'system-flow-Queue', // uppercase

      // invalid underscores
      '_system-flow-service', // leading underscore
      'system_-flow-service', // trailing underscore in first
      'system-flow-_service', // leading underscore in last
      'system-flow-service_', // trailing underscore in last
      'system__name-flow-service', // double underscore in first part
      'system-flow__name-service', // double underscore in second part
      'system-flow-service__name', // double underscore in third part

      // spaces
      'system flow-service-name',

      // misplaced hyphen/underscore
      'system--flow-service', // double hyphen
      'system-flow--service', // double hyphen
    ])('should not match regex (%s)', (name) => {
      expect(QUEUE_NAME_REGEX.test(name)).toBe(false)
    })
  })
})
