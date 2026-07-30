import { removeNonTranslatableTags } from '@lokalise/non-translatable-markup'

/**
 * How characters are counted.
 * Only `codePoints` (Unicode code points) exist today, but this is pluggable for future algorithms.
 */
export type CharacterCountAlgorithm = 'codePoints'

export type CountCharactersOptions = {
  /** The counting algorithm to use. Defaults to `codePoints`. */
  algorithm?: CharacterCountAlgorithm
}

/**
 * Counts the characters in a text.
 */
export function countCharacters(text: string, options?: CountCharactersOptions): number {
  const algorithm = options?.algorithm ?? 'codePoints'

  return algorithms[algorithm](removeNonTranslatableTags(text))
}

const algorithms: Record<CharacterCountAlgorithm, (text: string) => number> = {
  codePoints: (text) => [...text].length,
}
