export const ByteCountEncodingEnum = {
  UTF_8: 'utf8',
} as const

/**
 * How the text is encoded before its bytes are counted:
 * - `utf8`: UTF-8.
 *
 * Pluggable for future encodings too.
 */
export type ByteCountEncoding = (typeof ByteCountEncodingEnum)[keyof typeof ByteCountEncodingEnum]

export type CountBytesOptions = {
  /** The encoding to measure the text in. Defaults to `utf8`. */
  encoding?: ByteCountEncoding
}

const textEncoder = new TextEncoder()

// Declared after the encoders it references: they are consts, so they must be initialized first
const encodings: Record<ByteCountEncoding, (text: string) => number> = {
  utf8: (text: string) => textEncoder.encode(text).length,
}

/**
 * Counts the size of a text in bytes.
 *
 * The text is measured as given: non-translatable (NTC) markers and the content they wrap are
 * counted like any other character.
 */
export const countBytes = (text: string, options?: CountBytesOptions): number => {
  const encoding = options?.encoding ?? 'utf8'

  return encodings[encoding](text)
}
