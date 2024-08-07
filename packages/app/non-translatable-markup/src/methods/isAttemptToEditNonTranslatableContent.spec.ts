import { describe, expect, it } from 'vitest'
import { isAttemptToEditNonTranslatableContent } from './isAttemptToEditNonTranslatableContent'

describe('isAttemptToEditNonTranslatableContent', () => {
  it.each([
    ['Hello world', 'Hello friends'],
    ['Hello world', 'Hello world'],
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
    ],
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Sayonara \uE101{% endif %}\uE102 world',
    ],
    [
      'Sie haben sich am \uE101{% date %}\uE102 \uE101{% engaged %}\uE102',
      'Am \uE101{% date %}\uE102 haben sie sich \uE101{% engaged %}\uE102',
    ], // swapped non translatable content
  ])('returns false if non translatable content is not edited', (originalValue, updatedValue) => {
    expect(isAttemptToEditNonTranslatableContent(originalValue, updatedValue)).toBeFalsy()
  })

  it.each([
    '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %} my\uE102 world', // edited non translatable content
    '\uE101{% if MyVariable %}\uE102 Hello \uE101{% endif %}\uE102 world', // removed non translatable content
    '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %} world', // unbalanced tags
    '\uE101{% if MyVariable %} Hello {% endif %} Goodbye {% else %}\uE102', // whole content is non-translatable
  ])('returns true if non translatable content is edited', (updatedValue) => {
    const originalValue =
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world'
    expect(isAttemptToEditNonTranslatableContent(originalValue, updatedValue)).toBeTruthy()
  })
})
