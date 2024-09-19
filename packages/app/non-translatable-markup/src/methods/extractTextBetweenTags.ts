import { nonTranslatableTextRegexp, tagRegexpG } from './utils'

/**
 * Extract text parts between NTC tags and HTML tags and returns them as array.
 * The tags itself and the content they wrap are removed from the result.
 *
 * Note:
 *  - symbols and numbers are preserved
 *  - result text parts are trimmed.
 *
 * Examples:
 *  - 'Hello world' -> ['Hello world']
 *  - '<div class="test">Hello</div> world' -> ['Hello', 'world']
 *  - 'Hello \uE101 world!\uE102' -> ['Hello', 'world']
 */
export const extractTextBetweenTags = (text: string): string[] => {
  return text
    .split(nonTranslatableTextRegexp) // split the text by non-translatable tags
    .flatMap((piece) => piece.split(tagRegexpG)) // split the text by tags (<*>)
    .map((piece) => piece.trim()) // remove trailing whitespaces
    .filter((piece) => piece !== '') // remove empty pieces
}
