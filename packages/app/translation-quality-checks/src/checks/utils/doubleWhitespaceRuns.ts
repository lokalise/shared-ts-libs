import { extractTextBetweenTags } from '@lokalise/non-translatable-markup'

// Horizontal whitespace only: line terminators are legitimate formatting, not double whitespace.
const doubleWhitespaceRegexp = /[^\S\r\n]{2,}/g

/**
 * Extracts every run of two or more consecutive horizontal whitespace characters found in the
 * text. An NTC region is treated as a content token, no matter what it wraps: its inside is
 * never checked, and whitespace on either side of it does not add up to a run, exactly as the
 * spaces around a placeholder in `a %{x} b` are not consecutive whitespace. Only whitespace the
 * author can actually see and edit as adjacent counts.
 */
export const doubleWhitespaceRuns = (text: string): string[] =>
  extractTextBetweenTags(text, { keepHtml: true, preserveSpacing: true }).flatMap(
    (piece) => piece.match(doubleWhitespaceRegexp) ?? [],
  )
