import { dateRegexp, nonTranslatableTextRegexp, symbolsAndNumberRegexp } from './utils'

/**
 * Returns true if the text contain at least one translatable piece of text.
 * A translatable piece of text is a piece of text that is not surrounded by non-translatable tags,
 * symbols or a number.
 */
export const isTextTranslatable = (text: string): boolean =>
  trimAndFilterEmpty(text.split(nonTranslatableTextRegexp)).some((piece) =>
    isPieceTranslatable(piece),
  )

const isPieceTranslatable = (piece: string): boolean =>
  dateRegexp.test(piece) && !symbolsAndNumberRegexp.test(piece)

const trimAndFilterEmpty = (pieces: string[]): string[] =>
  pieces.map((p) => p.trim()).filter((p) => p !== '')
