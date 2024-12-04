import { describe, expect, it } from 'vitest'
import { deepClone } from './deepClone.js'

describe('deepClone', () => {
  it('will deep clone an object', () => {
    const object = {
      names: [
        {
          name: 'Cameron',
        },
        {
          name: 'Alexander',
        },
        {
          name: 'Smith',
        },
      ],
      date: new Date(),
      isEnabled: true,
      age: 12,
    }

    const clonedObject = deepClone(object)
    object.names = []
    object.age = 22
    object.isEnabled = false
    expect(clonedObject.date).instanceof(Date)
    expect(clonedObject.date).not.toBe(object.date)
    expect(clonedObject.names).toStrictEqual([
      {
        name: 'Cameron',
      },
      {
        name: 'Alexander',
      },
      {
        name: 'Smith',
      },
    ])
    expect(clonedObject.isEnabled).toBe(true)
    expect(clonedObject.age).toBe(12)
  })

  it('will return null or undefined if no object is provided', () => {
    expect(deepClone(undefined)).toBeUndefined()
    expect(deepClone(null)).toBeNull()
  })
})
