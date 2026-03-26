/**
 * Set of language subtags that use right-to-left script by default.
 * Used to determine text direction without relying on Intl.Locale.getTextInfo(),
 * which is not supported in Firefox.
 *
 * @link https://www.w3.org/International/questions/qa-scripts
 */
export const rtlLanguages = new Set([
  'ar', // Arabic
  'arc', // Aramaic
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
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
])
