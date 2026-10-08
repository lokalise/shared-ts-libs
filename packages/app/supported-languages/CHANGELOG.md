# @lokalise/supported-languages

## 3.6.0

### Minor Changes

- 8c512df: Add nine languages that CLDR43 lacks to the non-CLDR exception list: `acw`,
  `gyn`, `ksw`, `lgg`, `myx`, `ndc`, `skr`, `swk`, `tsg`. `acw` and `skr` are
  right-to-left.

## 3.5.1

### Patch Changes

- 7e1c820: Mark non-CLDR entries in `rtlLanguages` with a comment pointing to `nonCldrLanguages`.

## 3.5.0

### Minor Changes

- 67161b1: Support 5 IANA languages missing from CLDR43 (e.g. `cnh` Hakha Chin, `azb` South Azerbaijani) via a separate exception list: `isSupportedLocale` accepts them, the Arabic-script ones are RTL, and language names fall back to our own English names or the maximized tag in other languages.

## 3.4.0

### Minor Changes

- afc03af: Add Haitian Creole (`ht`, `ht-HT`) and Tagalog Philippines (`tl-PH`) to the Lokalise supported languages and standard locales.

## 3.3.0

### Minor Changes

- 2156ed9: Add `adjustSentenceAffixes(sourceLocale, targetLocale, affixes)` and the `Affixes` type: adapts the whitespace affixes surrounding a sentence to the target language's conventions.
