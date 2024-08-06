import { describe, expect, it } from 'vitest'
import { removeNonTranslatableTags } from './removeNonTranslatableTags'

describe('removeNonTranslatableTags', () => {
  it.each([
    ['Hello world', 'Hello world'],
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '{% if MyVariable %} Hello {% else %} Goodbye {% endif %} world',
    ],
    ['\uE101{% if MyVariable %}', '{% if MyVariable %}'],
    ['{% if MyVariable %}\uE102', '{% if MyVariable %}'],
  ])('removes non-translatable tags', (originalValue, updatedValue) => {
    expect(removeNonTranslatableTags(originalValue)).toBe(updatedValue)
  })
})
