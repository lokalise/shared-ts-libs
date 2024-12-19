/**
 * TODO: explain
 */
const leadingRegex = /^(?:[\s\u00A0]|&nbsp;)+/
/**
 *  TODO: explain
 */
const trailingRegex = /(?:[\s\u00A0]|&nbsp;)+$/

const extractFirstOccurrence = (text: string, regex: RegExp): string | undefined => {
  const match = text.match(regex)
  return match ? match[0] : undefined
}

export type TrimmedText = {
  value: string
  prefix?: string
  suffix?: string
}

export const trimText = (text: string): TrimmedText => ({
  value: text.replace(leadingRegex, '').replace(trailingRegex, ''),
  prefix: extractFirstOccurrence(text, leadingRegex),
  suffix: extractFirstOccurrence(text, trailingRegex),
})
