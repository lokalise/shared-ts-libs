import {
  NON_TRANSLATABLE_END_TAG,
  NON_TRANSLATABLE_START_TAG,
} from '@lokalise/non-translatable-markup'
import * as gmxWordCounter from 'gmx-word-counter'
import { countTranslatableWords } from './countTranslatableWords.ts'

describe('countTranslatableWords', () => {
  it.each([
    { name: 'plain text', text: 'Hello world', expected: 2 },
    { name: 'empty string', text: '', expected: 0 },
    {
      name: 'non-translatable content and its markers are excluded',
      text: `Hello ${NON_TRANSLATABLE_START_TAG}world${NON_TRANSLATABLE_END_TAG} again`,
      expected: 2,
    },
    { name: 'HTML-like tags are excluded', text: '<div class="x">Hello</div> world', expected: 2 },
  ])('counts translatable words: $name', ({ text, expected }) => {
    expect(countTranslatableWords(text)).toBe(expected)
  })

  describe('locale', () => {
    it("defaults to '-' when no locale is provided", () => {
      const countWordsSpy = vi.spyOn(gmxWordCounter, 'countWords')

      countTranslatableWords('Hello world')

      expect(countWordsSpy).toHaveBeenCalledWith('Hello world', '-')
    })

    it('forwards the provided locale to the counter', () => {
      const countWordsSpy = vi.spyOn(gmxWordCounter, 'countWords')

      countTranslatableWords('Hello world', { locale: 'en' })

      expect(countWordsSpy).toHaveBeenCalledWith('Hello world', 'en')
    })
  })
})
