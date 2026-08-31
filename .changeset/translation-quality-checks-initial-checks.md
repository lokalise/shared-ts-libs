---
'@lokalise/translation-quality-checks': major
---

Implement `detectQualityIssues` with the initial check set: single-text checks (leading, trailing,
and double whitespace) and mismatch checks against a reference text (leading/trailing/double
whitespace and non-translatable token consistency, reporting `missing`/`added` diffs). Supports
`checksToInclude`/`checksToExclude` and the `skipSingleTextChecks` shortcut; whitespace checks
ignore content inside NTC regions.
