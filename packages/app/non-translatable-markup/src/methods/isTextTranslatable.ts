import { dateRegexp, nonTranslatableTextRegexp, symbolsAndNumberRegexpG, tagRegexpG } from './utils'

/**
 * Returns true if the text contain at least one translatable piece of text.
 *
 * A translatable piece of text is a piece of text that is not surrounded by non-translatable tags or XML/HTML like tags,
 * symbols or a number.
 */
export const isTextTranslatable = (text: string): boolean =>
  text
    .split(nonTranslatableTextRegexp) // split the text by non-translatable tags and remove NTC regions
    .map((piece) => piece.replace(tagRegexpG, '').trim()) // remove tags and trim the pieces
    .filter((piece) => piece !== '') // remove empty pieces
    .some((piece) => dateRegexp.test(piece) || !symbolsAndNumberRegexpG.test(piece)) // check if at least one piece is translatable
