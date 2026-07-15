import { describe, expect, it } from 'vitest'
import { languages } from './languages.ts'
import { noSentenceSpacingLanguages } from './no-sentence-spacing-languages.ts'

describe('noSentenceSpacingLanguages', () => {
  it('is a subset of all languages', () => {
    for (const entry of noSentenceSpacingLanguages) {
      expect(languages.has(entry)).toBe(true)
    }
  })

  it('does not contain languages that separate sentences with whitespace', () => {
    /**
     * th/lo/km/my lack inter-word spaces but still use whitespace between sentences or phrases,
     * and bo/dz place a space after the shad clause mark
     */
    for (const code of ['th', 'lo', 'km', 'my', 'bo', 'dz']) {
      expect(noSentenceSpacingLanguages.has(code), code).toBe(false)
    }
  })
})
