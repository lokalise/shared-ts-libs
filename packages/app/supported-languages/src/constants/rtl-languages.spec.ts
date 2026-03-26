import { describe, expect, it } from 'vitest'
import { languages } from './languages.ts'
import { rtlLanguages } from './rtl-languages.ts'

describe('rtlLanguages', () => {
  it('is a subset of all languages', () => {
    for (const entry of rtlLanguages) {
      expect(languages.has(entry)).toBe(true)
    }
  })
})