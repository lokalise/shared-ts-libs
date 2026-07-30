import { extractTextBetweenTags } from '@lokalise/non-translatable-markup'
import { countWords } from 'gmx-word-counter'

export type CountTranslatableWordsOptions = {
  /**
   * BCP47 language subtag used for word segmentation (e.g. `en`, `zh`).
   * A full tag like `zh-CN` is reduced to its primary subtag by the counter.
   *
   * Defaults to `-` (language-agnostic).
   */
  locale?: string
}

/**
 * Counts the translatable words in a text, excluding non-translatable content (NTC) and tags.
 */
export const countTranslatableWords = (
  text: string,
  options?: CountTranslatableWordsOptions,
): number => {
  const locale = options?.locale ?? '-'

  return extractTextBetweenTags(text).reduce((total, piece) => total + countWords(piece, locale), 0)
}
