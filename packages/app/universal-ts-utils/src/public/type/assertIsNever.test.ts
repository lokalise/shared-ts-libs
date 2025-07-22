import { expect } from 'vitest'
import { assertIsNever } from './assertIsNever.js'

describe('assertIsNever', () => {
  it('should throw an error if a non-never value is passed in', () => {
    expect(() => assertIsNever('not-never' as never)).toThrowError()
  })
})
