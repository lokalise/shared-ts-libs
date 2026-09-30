---
"@lokalise/supported-languages": minor
---

Support 5 IANA languages missing from CLDR43 (e.g. `cnh` Hakha Chin, `azb` South Azerbaijani) via a separate exception list: `isSupportedLocale` accepts them, the Arabic-script ones are RTL, and language names fall back to our own English names or the maximized tag in other languages.
