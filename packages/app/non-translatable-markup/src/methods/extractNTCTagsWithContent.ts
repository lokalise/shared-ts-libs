import { nonTranslatableTextRegexpG } from './utils.ts'

/**
 * Extracts every non-translatable region of the text — the NTC tags and the content they wrap —
 * in order of appearance. Unpaired tags are not considered a region and are left out.
 */
export const extractNTCTagsWithContent = (text: string): string[] =>
  text.match(nonTranslatableTextRegexpG) ?? []
