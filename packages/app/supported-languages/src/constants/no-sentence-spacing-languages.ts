/**
 * Set of language subtags whose scripts do not use whitespace to separate
 * sentences or phrases.
 *
 * Sentence boundaries are marked with fullwidth punctuation such as `。` instead.
 */
export const noSentenceSpacingLanguages = new Set([
  'ii', // Sichuan Yi (Nuosu)
  'ja', // Japanese
  'yue', // Cantonese
  'zh', // Chinese
])
