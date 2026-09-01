# Translation quality checks

Deterministic, code-based quality checks for translations — the rule-based counterpart to AI
scoring. Pure and dependency-light: same input, same issues, no I/O — runs in the browser or in
any backend with identical results.

Checks come in two families:

- **Single-text checks** evaluate one text in isolation: `LEADING_WHITESPACE`,
  `TRAILING_WHITESPACE`, `DOUBLE_WHITESPACE`.
- **Mismatch checks** compare a text against a reference text — typically the text it was
  translated from, but any reference works (e.g. another version of the same translation):
  `LEADING_WHITESPACE_MISMATCH`, `TRAILING_WHITESPACE_MISMATCH`, `DOUBLE_WHITESPACE_MISMATCH`,
  `NON_TRANSLATABLE_TAGS_MISMATCH`.

Content wrapped in NTC markers (see `@lokalise/non-translatable-markup`) is never evaluated by the
whitespace checks — it is not translatable, so its whitespace is intentional.

## `detectQualityIssues`

Runs the checks and returns the issues found. Two call shapes:

```typescript
import { detectQualityIssues } from '@lokalise/translation-quality-checks'

// Single text: runs the single-text checks only.
detectQualityIssues(' Hola')
// [{ error: 'LEADING_WHITESPACE', details: undefined }]

// Text + reference: runs the single-text checks on the text, plus the mismatch checks.
detectQualityIssues('Hola  %{name}', 'Hello %{name}')
// [
//   { error: 'DOUBLE_WHITESPACE_MISMATCH', details: { missing: [], added: ['  '] } },
//   { error: 'DOUBLE_WHITESPACE', details: { whitespaces: ['  '] } },
// ]
```

An empty result means the text passed every check.

### Options

Both call shapes accept an options object:

- `checksToInclude` — checks to run; defaults to all of them when omitted, while an empty array
  runs none.
- `checksToExclude` — checks to skip; wins over `checksToInclude` on overlap.
- `skipSingleTextChecks` *(pair call only)* — shortcut for excluding every single-text check, so
  only the mismatch checks run.

```typescript
detectQualityIssues(' Hola ', { checksToExclude: ['LEADING_WHITESPACE'] })
detectQualityIssues(' Hola', 'Hello', { skipSingleTextChecks: true })
```

## Issues

Every issue is `{ error, details }`, discriminated by `error` — a `switch` over it narrows
`details` to the right shape:

| `error` | `details` |
| --- | --- |
| `LEADING_WHITESPACE` | `undefined` — the text starts with whitespace |
| `TRAILING_WHITESPACE` | `undefined` — the text ends with whitespace |
| `DOUBLE_WHITESPACE` | `{ whitespaces }` — every run of 2+ consecutive whitespace characters found |
| `LEADING_WHITESPACE_MISMATCH` | `{ source, target }` — the differing leading whitespace of each side |
| `TRAILING_WHITESPACE_MISMATCH` | `{ source, target }` — the differing trailing whitespace of each side |
| `DOUBLE_WHITESPACE_MISMATCH` | `{ missing, added }` — runs the text dropped / introduced vs the reference |
| `NON_TRANSLATABLE_TAGS_MISMATCH` | `{ missing, added }` — NTC tokens (placeholders, tags) the text dropped / introduced vs the reference |

`missing`/`added` diffs are computed as multisets: position-independent (positions naturally shift
between languages) with duplicates counted — dropping one of two `<br>` tokens reports exactly one
`missing` entry.

The relevant types are exported: `QualityIssue` (the union of every issue),
`QualityIssueErrorEnum`/`QualityIssueError` (the error codes), and the options for each call
shape (`SingleTextDetectQualityIssuesOptions` and `PairDetectQualityIssuesOptions`).
