import { noSentenceSpacingLanguages } from '../constants/no-sentence-spacing-languages.ts'
import { type Locale, parseLocale } from './locale.ts'

/**
 * Whitespace surrounding a sentence. `undefined` means there is no sentence
 * boundary on that side (the document or content run starts/ends there); an
 * empty string marks a boundary whose separator has zero width (e.g. between
 * two Japanese sentences).
 */
export type Affixes = {
  prefix?: string
  suffix?: string
}

/**
 * Whitespace that spacing scripts use to separate sentences, plus
 * the literal `&nbsp;` sequence.
 */
const spacingSeparatorsRegex = /[\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F]|&nbsp;/g

/**
 * The ideographic space, the horizontal spacing character native to scripts
 * that do not separate sentences with whitespace.
 */
const ideographicSpacesRegex = /\u3000/g

const removeSpacingSeparators = (affix: string): string => affix.replace(spacingSeparatorsRegex, '')

const convertIdeographicSpaces = (affix: string): string =>
  affix.replace(ideographicSpacesRegex, ' ')

const adjustSentenceAffix = (
  affix: string | undefined,
  sourceLanguage: string,
  targetLanguage: string,
): string | undefined => {
  if (affix === undefined) return undefined

  let adjusted = affix

  if (noSentenceSpacingLanguages.has(targetLanguage)) {
    adjusted = removeSpacingSeparators(adjusted)
  } else if (noSentenceSpacingLanguages.has(sourceLanguage)) {
    adjusted = convertIdeographicSpaces(adjusted)
    // a zero-width boundary marker materializes as a regular space
    adjusted = adjusted === '' ? ' ' : adjusted
  }

  return adjusted
}

/**
 * Adjusts the affixes surrounding a sentence.
 *
 * Rules:
 * - The target does not use whitespace between sentences:
 *    spacing separators and the literal &nbsp; are removed. A separator that
 *    becomes empty is kept as `''` — the zero-width boundary marker.
 * - The source does not use whitespace between sentences but the target
 *   does: ideographic spaces (U+3000) become regular spaces, one for one,
 *   and a `''` boundary marker materializes as a regular space.
 *
 * @param sourceLocale - Locale the sentence was translated from.
 * @param targetLocale - Locale the sentence was translated into.
 * @param affixes - The affixes captured around the source sentence.
 * @returns The affixes adapted to the target language.
 * @throws Error when either locale is not supported.
 */
export const adjustSentenceAffixes = (
  sourceLocale: Locale,
  targetLocale: Locale,
  affixes: Affixes,
): Affixes => {
  const parsedSourceLocale = parseLocale(sourceLocale)
  if (!parsedSourceLocale.result) throw parsedSourceLocale.error
  const parsedTargetLocale = parseLocale(targetLocale)
  if (!parsedTargetLocale.result) throw parsedTargetLocale.error

  const sourceLanguage = parsedSourceLocale.result.language
  const targetLanguage = parsedTargetLocale.result.language

  const prefix = adjustSentenceAffix(affixes.prefix, sourceLanguage, targetLanguage)
  const suffix = adjustSentenceAffix(affixes.suffix, sourceLanguage, targetLanguage)

  return {
    ...(prefix !== undefined && { prefix }),
    ...(suffix !== undefined && { suffix }),
  }
}
