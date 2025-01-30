import { describe, it } from 'vitest'
import type { FreeformRecord } from './FreeformRecord.js'

describe('FreeformRecord', () => {
  it('should infer string type key and allow any as value', () => {
    const record: FreeformRecord = {
      name: 'Alice',
      age: 30,
      isActive: true,
    }

    // should compile without errors
    record as FreeformRecord<string>
  })

  it('should allow number type for key and allow any as value', () => {
    const record: FreeformRecord<number> = {
      1: 'one',
      2: 2,
      3: true,
    }

    // should compile without errors
    record as FreeformRecord<number>
  })
})
