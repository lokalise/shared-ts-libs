declare namespace Intl {
  interface Locale {
    getTextInfo?: () => { direction: 'ltr' | 'rtl' } // Available on Node 24+
    textInfo?: { direction: 'ltr' | 'rtl' } // Available on Node 20+
  }
}
