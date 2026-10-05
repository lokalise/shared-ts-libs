/**
 * Languages that are not part of CLDR43 but are supported because existing data uses them.
 * They are valid IANA language subtags, but CLDR provides no display names or plural rules for them.
 *
 * Maps each language subtag to its English name, used in place of the missing CLDR display name.
 *
 * These languages are not part of the languages supported by Lokalise. Prefer CLDR languages or
 * private use tags (e.g. `en-x-custom-1`) over adding new entries here.
 *
 * @link https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
 */
export const nonCldrLanguages = new Map([
  ['afb', 'Gulf Arabic'],
  ['azb', 'South Azerbaijani'],
  ['cnh', 'Hakha Chin'],
  ['koo', 'Konzo'],
  ['ksw', "S'gaw Karen"],
  ['laj', 'Lango'],
])
