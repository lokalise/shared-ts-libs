import { describe, expect, it } from 'vitest'
import { removeNonTranslatableTags } from './removeNonTranslatableTags.ts'

describe('removeNonTranslatableTags', () => {
  it.each([
    ['Hello world', 'Hello world'],
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '{% if MyVariable %} Hello {% else %} Goodbye {% endif %} world',
    ],
    ['\uE101{% if MyVariable %}', '\uE101{% if MyVariable %}'],
    ['{% if MyVariable %}\uE102', '{% if MyVariable %}\uE102'],
    ['{% if MyVariable %}\uE101\uE102', '{% if MyVariable %}\uE101\uE102'],
    ['\uE101\uE101\uE110\uE102 text \uE101\uE102\uE111\uE102', '\uE101\uE110 text \uE102\uE111'],
    ['\uE101\uE102\uE111\uE101\uE112\uE102', '\uE102\uE111\uE101\uE112'], // duplicated NT tags inside of NT region
    ['\uE101\uE102\uE111\uE102\uE101\uE101\uE112\uE102', '\uE102\uE111\uE101\uE112'], // duplicated NT tags inside of NT region
  ])('removes non-translatable tags', (originalValue, updatedValue) => {
    expect(removeNonTranslatableTags(originalValue)).toBe(updatedValue)
  })
})
