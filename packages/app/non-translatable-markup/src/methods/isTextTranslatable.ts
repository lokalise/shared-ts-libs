import { nonTranslatableTextRegexp, symbolsRegexp } from './utils'

/**
 * Returns true if the text contain at least one translatable piece of text.
 * A translatable piece of text is a piece of text that is not surrounded by non-translatable tags,
 * symbols or a number.
 */
export const isTextTranslatable = (text: string): boolean =>
  filterEmpty(text.split(nonTranslatableTextRegexp)).some((piece) => isPieceTranslatable(piece))

const isPieceTranslatable = (piece: string): boolean => {
  // numbers are not translatable
  if (!Number.isNaN(+piece)) return false

  // if it contains symbols, split the piece and check each part
  if (symbolsRegexp.test(piece))
    return filterEmpty(piece.split(symbolsRegexp)).some((e) => isPieceTranslatable(e))

  return true
}

const filterEmpty = (pieces: string[]): string[] => pieces.filter((piece) => piece.trim() !== '')
