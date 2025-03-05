import { describe, expect, it } from 'vitest'
import { isAttemptToEditNonTranslatableContent } from './isAttemptToEditNonTranslatableContent.js'

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
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %} my\uE102 world',
    ], // edited non translatable content
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% endif %}\uE102 world',
    ], // removed non translatable content
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %} world',
    ], // unbalanced tags
    [
      '\uE101{% if MyVariable %}\uE102 Hello \uE101{% else %}\uE102 Goodbye \uE101{% endif %}\uE102 world',
      '\uE101{% if MyVariable %} Hello {% endif %} Goodbye {% else %}\uE102',
    ], // whole content is non-translatable,
    ['\uE101\uE102\uE111\uE101\uE112\uE102', '\uE101\uE102abc\uE101\uE112\uE102'], // whole content is non-translatable and contains only NT inline codes,
    [
      '\uE101\uE102\uE111\uE102\uE101\uE101\uE112\uE102',
      '\uE101abc\uE111\uE102\uE101\uE101\uE112\uE102',
    ], // whole content is non-translatable and contains only NT inline codes second case
  ])('returns true if non translatable content is edited', (originalValue, updatedValue) => {
    expect(isAttemptToEditNonTranslatableContent(originalValue, updatedValue)).toBeTruthy()
  })
})
