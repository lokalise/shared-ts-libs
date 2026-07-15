import { describe, expect, it } from 'vitest'
import { languages } from './languages.ts'
import { noSentenceSpacingLanguages } from './no-sentence-spacing-languages.ts'

describe('noSentenceSpacingLanguages', () => {
  it('is a subset of all languages', () => {
    for (const entry of noSentenceSpacingLanguages) {
      expect(languages.has(entry)).toBe(true)
    }
  })
})
