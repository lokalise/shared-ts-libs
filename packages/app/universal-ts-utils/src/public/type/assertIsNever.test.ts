import { expect } from 'vitest'
import { assertIsNever } from './assertIsNever.js'

describe('assertIsNever', () => {
  it('should throw an error if a non-never value is passed in', () => {
    expect(() => assertIsNever('not-never' as never)).toThrowError()
  })

  describe('assertIsNever', () => {
    it('should throw an error if a non-never value is passed in', () => {
      expect(() => assertIsNever('not-never' as never)).toThrowError()
    })

    it('should throw an error with descriptive message for string values', () => {
      expect(() => assertIsNever('test' as never)).toThrowError('Unexpected value: "test"')
    })

    it('should throw an error with descriptive message for object values', () => {
      expect(() => assertIsNever({ key: 'value' } as never)).toThrowError(
        'Unexpected value: {"key":"value"}',
      )
    })

    it('should throw an error with descriptive message for null values', () => {
      expect(() => assertIsNever(null as never)).toThrowError('Unexpected value: null')
    })
  })
})
