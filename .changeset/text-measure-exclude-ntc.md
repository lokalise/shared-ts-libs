---
"@lokalise/text-measure": minor
---

Add `excludeNtc` option to `countCharacters` to exclude non-translatable content (text wrapped between NTC tags) from the count. Defaults to `false`, preserving the current behavior of counting the wrapped content.