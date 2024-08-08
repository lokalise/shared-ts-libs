import { nonTranslatableTextRegexp, symbolsAndNumberRegexp } from './utils'

/**
 * Returns true if the text contain at least one translatable piece of text.
 * A translatable piece of text is a piece of text that is not surrounded by non-translatable tags,
 * symbols or a number.
 */
export const isTextTranslatable = (text: string): boolean =>
  trimAndFilterEmpty(text.split(nonTranslatableTextRegexp)).some((piece) =>
    isPieceTranslatable(piece),
  )

const isPieceTranslatable = (piece: string): boolean => {
  // dates are translatable
  if (includesDate(piece)) return true

  return !symbolsAndNumberRegexp.test(piece)
}

const includesDate = (text: string) => {
  // TODO: improve this check to cover all possibilities
  const date = new Date(text)
  return !Number.isNaN(date.getTime())
}

const trimAndFilterEmpty = (pieces: string[]): string[] =>
  pieces.map((p) => p.trim()).filter((p) => p !== '')
