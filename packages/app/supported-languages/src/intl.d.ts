declare namespace Intl {
  interface Locale {
    textInfo?: { direction: 'ltr' | 'rtl' }
    getTextInfo(): { direction: 'ltr' | 'rtl' }
  }
}
