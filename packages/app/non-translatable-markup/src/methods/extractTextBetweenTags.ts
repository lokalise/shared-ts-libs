import { nonTranslatableTextRegexp, tagRegexpG } from './utils'

/**
 * Extract text parts between NTC tags and HTML like tags and returns them as array.
 * The tags itself and the content they wrap are removed from the result.
 *
 * With the second parameter (`options`) you can explicitly specify if you want to keep html and/or ntc tags
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
export const extractTextBetweenTags = (
  text: string,
  options?: { keepNtc?: boolean; keepHtml?: boolean },
): string[] => {
  let pieces: string[] = [text]
  // split the text by non-translatable tags
  if (!options?.keepNtc) pieces = pieces.flatMap((piece) => piece.split(nonTranslatableTextRegexp))
  // split the text by tags (<*>)
  if (!options?.keepHtml) pieces = pieces.flatMap((piece) => piece.split(tagRegexpG))

  return pieces
    .map((piece) => piece.trim()) // remove trailing whitespaces
    .filter((piece) => piece !== '') // remove empty pieces
}
