import {
  closingTagRegexpG,
  nonTranslatableTagsRegexpG,
  nonTranslatableTextRegexp,
  tagRegexpG,
  wrappedElementRegexp,
} from './utils.ts'

/**
 * How non-translatable regions are handled:
 *  - `remove`: the region and its content are removed (default)
 *  - `keep`: the region is kept as it is
 *  - `unwrapElements`: a region that is a single XML-like element wrapping some text
 *    (e.g. `\uE101<notrans>My House</notrans>\uE102`) is replaced by that text; any other region is removed
 */
export type NtcHandling = 'remove' | 'keep' | 'unwrapElements'

type BaseExtractTextBetweenTagsOptions = {
  /** Keep HTML-like tags in the result instead of splitting the text by them (default: false) */
  keepHtml?: boolean
  /** Keep the original whitespace of each piece instead of trimming it (default: false) */
  preserveSpacing?: boolean
}

export type ExtractTextBetweenTagsOptions = BaseExtractTextBetweenTagsOptions &
  (
    | {
        /** How non-translatable regions are handled, see {@link NtcHandling} (default: 'remove') */
        ntc?: NtcHandling
        keepNtc?: never
      }
    | {
        /** @deprecated use `ntc: 'keep'` instead */
        keepNtc?: boolean
        ntc?: never
      }
  )

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
 *  - 'Welcome to \uE101<notrans>My House</notrans>\uE102' with `ntc: 'unwrapElements'` -> ['Welcome to My House']
 */
export const extractTextBetweenTags = (
  text: string,
  options?: ExtractTextBetweenTagsOptions,
): string[] => {
  const ntc: NtcHandling = options?.ntc ?? (options?.keepNtc ? 'keep' : 'remove')

  let pieces: string[] = [ntc === 'unwrapElements' ? unwrapNonTranslatableElements(text) : text]
  // split the text by non-translatable tags
  if (ntc !== 'keep') pieces = pieces.flatMap((piece) => piece.split(nonTranslatableTextRegexp))
  // split the text by tags (<*>)
  if (!options?.keepHtml) pieces = pieces.flatMap((piece) => piece.split(tagRegexpG))

  if (!options?.preserveSpacing) pieces = pieces.map((piece) => piece.trim())

  return pieces.filter((piece) => piece !== '') // remove empty pieces
}

/**
 * Replaces every non-translatable region that is a single XML-like element wrapping some text
 * by that text. Any other region is left untouched.
 */
const unwrapNonTranslatableElements = (text: string): string =>
  text.replace(nonTranslatableTagsRegexpG, (region, ntcContent: string) => {
    const match = wrappedElementRegexp.exec(ntcContent)
    if (!match) return region

    const [, tagName, content] = match
    // `<a>x</a><a>y</a>` is not a single element, even if it starts and ends with the same tag
    if (!content?.trim() || hasClosingTag(content, tagName)) return region

    return content
  })

const hasClosingTag = (text: string, tagName?: string): boolean =>
  Array.from(text.matchAll(closingTagRegexpG)).some(
    ([, closingTagName]) => closingTagName === tagName,
  )
