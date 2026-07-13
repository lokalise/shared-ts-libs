import { nonTranslatableTextRegexp, tagRegexpG } from './utils.ts'

export type ExtractTextBetweenTagsOptions = {
  keepNtc?: boolean
  keepHtml?: boolean
  preserveSpacing?: boolean
}

/**
 * Extract text parts between NTC tags and HTML like tags and returns them as array.
 * The tags itself and the content they wrap are removed from the result.
 *
 * With the second parameter (`options`) you can explicitly specify if you want to keep html and/or ntc tags.
 * With `preserveSpacing` the pieces keep their original whitespace (no trimming), so joining them
 * with '' reconstructs the text exactly as authored, minus the removed regions.
 *
 * Note:
 *  - symbols and numbers are preserved
 *  - result text parts are trimmed, unless `preserveSpacing` is set.
 *
 * Examples:
 *  - 'Hello world' -> ['Hello world']
 *  - '<div class="test">Hello</div> world' -> ['Hello', 'world']
 *  - 'Hello \uE101world!\uE102' -> ['Hello']
 *  - 'Hi \uE101x\uE102, bye' with `preserveSpacing` -> ['Hi ', ', bye']
 */
export const extractTextBetweenTags = (
  text: string,
  options?: ExtractTextBetweenTagsOptions,
): string[] => {
  let pieces: string[] = [text]
  // split the text by non-translatable tags
  if (!options?.keepNtc) pieces = pieces.flatMap((piece) => piece.split(nonTranslatableTextRegexp))
  // split the text by tags (<*>)
  if (!options?.keepHtml) pieces = pieces.flatMap((piece) => piece.split(tagRegexpG))

  if (!options?.preserveSpacing) pieces = pieces.map((piece) => piece.trim())

  return pieces.filter((piece) => piece !== '') // remove empty pieces
}
