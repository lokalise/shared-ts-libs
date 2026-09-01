import { extractTextBetweenTags } from '@lokalise/non-translatable-markup'

// Horizontal whitespace only: line terminators are legitimate formatting, not double whitespace.
const doubleWhitespaceRegexp = /[^\S\r\n]{2,}/g

/**
 * Extracts every run of two or more consecutive horizontal whitespace characters found in the
 * text. Content inside NTC regions is not checked: the text is split by NTC region and every
 * piece is scanned on its own, so a run can never span a region boundary.
 */
export const doubleWhitespaceRuns = (text: string): string[] =>
  extractTextBetweenTags(text, { keepHtml: true, preserveSpacing: true }).flatMap(
    (piece) => piece.match(doubleWhitespaceRegexp) ?? [],
  )
