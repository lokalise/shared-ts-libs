import { describe, expect, it } from 'vitest'
import { adjustSentenceAffixes } from './affixes.ts'

describe('adjustSentenceAffixes', () => {
  it('throws when the source locale is not supported', () => {
    expect(() => adjustSentenceAffixes('abc', 'ja', {})).toThrow()
  })

  it('throws when the target locale is not supported', () => {
    expect(() => adjustSentenceAffixes('en', 'abc', {})).toThrow()
  })

  it('always preserves undefined affixes, never inventing a boundary', () => {
    const langPairs = [
      ['en', 'ja'],
      ['ja', 'en'],
      ['en', 'es'],
    ] as const

    for (const [source, target] of langPairs) {
      expect(adjustSentenceAffixes(source, target, {})).toEqual({})
      expect(adjustSentenceAffixes(source, target, { prefix: ' ' })).not.toHaveProperty('suffix')
      expect(adjustSentenceAffixes(source, target, { suffix: ' ' })).not.toHaveProperty('prefix')
    }
  })

  describe('noSentenceSpacingLanguages', () => {
    it('returns affixes unchanged when neither language is in noSentenceSpacingLanguages', () => {
      const affixes = { prefix: '\n', suffix: ' ' }
      for (const target of ['es', 'fr', 'it', 'nl']) {
        expect(adjustSentenceAffixes('en', target, affixes), target).toEqual(affixes)
      }
    })

    describe('source is within noSentenceSpacingLanguages', () => {
      it('converts ideographic spaces into regular spaces, one for one', () => {
        expect(adjustSentenceAffixes('ja', 'en', { suffix: '\u3000' })).toEqual({ suffix: ' ' })
        expect(adjustSentenceAffixes('ja', 'en', { suffix: '\u3000\u3000' })).toEqual({
          suffix: '  ',
        })
      })

      it('materializes an empty-string boundary marker as a regular space', () => {
        expect(adjustSentenceAffixes('ja', 'en', { prefix: '' })).toEqual({ prefix: ' ' })
      })

      it('leaves structural whitespace as is', () => {
        expect(adjustSentenceAffixes('ja', 'en', { prefix: '\n' })).toEqual({ prefix: '\n' })
      })
    })

    describe('target is within noSentenceSpacingLanguages', () => {
      it('removes spacing separators, keeping the boundary as an empty string', () => {
        expect(adjustSentenceAffixes('en', 'ja', { prefix: ' ', suffix: '  ' })).toEqual({
          prefix: '',
          suffix: '',
        })
        expect(adjustSentenceAffixes('en', 'zh', { suffix: ' ' })).toEqual({ suffix: '' })
        expect(adjustSentenceAffixes('en', 'yue', { suffix: ' ' })).toEqual({ suffix: '' })
        expect(adjustSentenceAffixes('en', 'ii', { suffix: ' ' })).toEqual({ suffix: '' })
      })

      it('removes every spacing separator and the literal &nbsp;', () => {
        const affixes = { prefix: '\u00A0&nbsp;', suffix: '\u2003\u2009\u202F\u205F' }
        expect(adjustSentenceAffixes('en', 'ja', affixes)).toEqual({ prefix: '', suffix: '' })
      })

      it('preserves line breaks and tabs', () => {
        expect(adjustSentenceAffixes('en', 'ja', { prefix: '\n ', suffix: ' \t' })).toEqual({
          prefix: '\n',
          suffix: '\t',
        })
      })

      it('keeps the ideographic space, which is native to those scripts', () => {
        expect(adjustSentenceAffixes('zh', 'ja', { suffix: '\u3000' })).toEqual({
          suffix: '\u3000',
        })
      })

      it('matches on the language subtag', () => {
        expect(adjustSentenceAffixes('en-US', 'ja-JP', { suffix: ' ' })).toEqual({ suffix: '' })
        expect(adjustSentenceAffixes('en', 'zh-Hant', { suffix: ' ' })).toEqual({ suffix: '' })
      })
    })
  })

  it('is idempotent', () => {
    for (const [source, target] of [
      ['en', 'ja'],
      ['ja', 'en'],
    ] as const) {
      const once = adjustSentenceAffixes(source, target, { prefix: '\n ', suffix: '\u3000' })
      expect(adjustSentenceAffixes(source, target, once)).toEqual(once)
    }
  })
})
