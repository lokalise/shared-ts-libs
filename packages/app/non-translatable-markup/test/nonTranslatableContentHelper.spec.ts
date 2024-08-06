import { describe, expect, it } from 'vitest'

import {
  isAttemptToEditNonTranslatableContent,
  isTextTranslatable,
  removeNonTranslatableTags,
} from '../src'

describe('nonTranslatableContentHelper', () => {
  describe('isTextTranslatable', () => {
    it('should return false on empty text', () => {
      expect(isTextTranslatable('')).toBe(false)
    })

    it('should return false on trimmed empty text', () => {
      expect(isTextTranslatable('    ')).toBe(false)
    })

    it('should return true if text contains translatable content', () => {
      const testCases = [
        'Hello',
        'Hello, World!',
        'Hello, \uE101World!\uE102',
        'Hello, \uE101World!\uE102 How are you?',
        'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
        ' \uE101Hello world!\uE102 How are you? \uE101I am fine!\uE102 ',
      ]

      for (const testCase of testCases) {
        expect(isTextTranslatable(testCase)).toBe(true)
      }
    })

    it('should return false if text contains only non-translatable content', () => {
      const testCases = [
        '\uE101Hello world!\uE102',
        ' \uE101Hello world!\uE102 \uE101How are you\uE102 ',
      ]

      for (const testCase of testCases) {
        expect(isTextTranslatable(testCase)).toBe(false)
      }
    })
  })

  describe('isAttemptToEditNonTranslatableContent', () => {
    it.each([
      ['Hello world', 'Hello friends'],
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
})
