import { removeNonTranslatableTags } from '@lokalise/non-translatable-markup'

/**
 * How characters are counted:
 * - `utf16`: UTF-16 code units.
 * - `codePoints`: Unicode code points.
 *
 * Pluggable for future algorithms too.
 */
export type CharacterCountAlgorithm = 'utf16' | 'codePoints'

export type CountCharactersOptions = {
  /** The counting algorithm to use. Defaults to `utf16`. */
  algorithm?: CharacterCountAlgorithm
}

/**
 * Counts the characters in a text.
 */
export function countCharacters(text: string, options?: CountCharactersOptions): number {
  const algorithm = options?.algorithm ?? 'utf16'

  return algorithms[algorithm](removeNonTranslatableTags(text))
}

const algorithms: Record<CharacterCountAlgorithm, (text: string) => number> = {
  utf16: (text) => text.length,
  codePoints: (text) => [...text].length,
}
