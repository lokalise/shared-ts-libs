import {
  extractTextBetweenTags,
  removeNonTranslatableTags,
} from '@lokalise/non-translatable-markup'

export const CharacterCountAlgorithmEnum = {
  UTF_16: 'utf16',
  CODE_POINTS: 'codePoints',
} as const
/**
 * How characters are counted:
 * - `utf16`: UTF-16 code units.
 * - `codePoints`: Unicode code points.
 *
 * Pluggable for future algorithms too.
 */
export type CharacterCountAlgorithm =
  (typeof CharacterCountAlgorithmEnum)[keyof typeof CharacterCountAlgorithmEnum]

export type CountCharactersOptions = {
  /** The counting algorithm to use. Defaults to `utf16`. */
  algorithm?: CharacterCountAlgorithm
  /**
   * When `true`, non-translatable content (the text wrapped between NTC tags,
   * tags included) is removed before counting. Defaults to `false`, in which
   * case only the NTC tags are stripped and the content they wrap is counted.
   */
  excludeNtc?: boolean
}

/**
 * Counts the characters in a text.
 */
export function countCharacters(text: string, options?: CountCharactersOptions): number {
  const algorithm = options?.algorithm ?? 'utf16'

  const normalized = options?.excludeNtc
    ? extractTextBetweenTags(text, { keepHtml: true, preserveSpacing: true }).join('')
    : removeNonTranslatableTags(text)

  return algorithms[algorithm](normalized)
}

const algorithms: Record<CharacterCountAlgorithm, (text: string) => number> = {
  utf16: (text) => text.length,
  codePoints: (text) => [...text].length,
}
