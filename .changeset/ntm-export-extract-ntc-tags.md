---
'@lokalise/non-translatable-markup': minor
---

Export `extractNTCTagsWithContent`, which extracts every non-translatable region of a text (the
NTC tags and the content they wrap) in order of appearance. Previously an internal helper of
`isAttemptToEditNonTranslatableContent`.
