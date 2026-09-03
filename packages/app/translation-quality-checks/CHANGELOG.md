# @lokalise/translation-quality-checks

## 1.0.0

### Major Changes

- b2b7df8: Implement `detectQualityIssues` with the initial check set: single-text checks (leading, trailing,
  and double whitespace) and mismatch checks against a reference text (leading/trailing/double
  whitespace and non-translatable token consistency, reporting `missing`/`added` diffs). Supports
  `checksToInclude`/`checksToExclude` and the `skipSingleTextChecks` shortcut; whitespace checks
  ignore content inside NTC regions.

### Patch Changes

- Updated dependencies [b2b7df8]
  - @lokalise/non-translatable-markup@3.3.0
