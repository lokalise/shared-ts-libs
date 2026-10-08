/**
 * Set of language subtags that use right-to-left script by default.
 * Used to determine text direction without relying on Intl.Locale.getTextInfo(),
 * which is not supported in Firefox.
 *
 * @link https://www.w3.org/International/questions/qa-scripts
 */
export const rtlLanguages = new Set([
  'acw', // Hijazi Arabic (non-CLDR, see nonCldrLanguages)
  'afb', // Gulf Arabic (non-CLDR, see nonCldrLanguages)
  'ar', // Arabic
  'arc', // Aramaic
  'azb', // South Azerbaijani (non-CLDR, see nonCldrLanguages)
  'ckb', // Central Kurdish (Sorani)
  'dv', // Dhivehi
  'fa', // Persian (Farsi)
  'ha', // Hausa (Ajami)
  'he', // Hebrew
  'khw', // Khowar
  'ks', // Kashmiri
  'ku', // Kurdish (Arabic script)
  'nqo', // N'Ko
  'ps', // Pashto
  'sd', // Sindhi
  'skr', // Saraiki (non-CLDR, see nonCldrLanguages)
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
])
