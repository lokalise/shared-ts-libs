import { nonTranslatableTextRegexp, tagRegexpG } from "./utils";

/**
 * Extract text parts between NT tags and HTML tags
 * Symbols and numbers are preserved
 */
export const extractTranslatableTextPieces  = (text: string): string[] => {
    return text.split(nonTranslatableTextRegexp) // split the text by non-translatable tags
      .flatMap((piece) => piece.split(tagRegexpG)) // split the text by tags (<*>)
      .map(piece => piece.trim()) // remove trailing whitespaces
      .filter((piece) => piece !== '') // remove empty pieces
}
