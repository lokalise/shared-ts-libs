# Text measure

Utilities to measure text for Lokalise — character count and translatable word count — with
pluggable counting rules. Runs in both the browser and Node.

## `countCharacters`

Counts the characters in a text. Non-translatable (NTC) marker tags are excluded (the content they
wrap is kept); everything else in the text, including whitespace, is counted.

```typescript
import { countCharacters } from '@lokalise/text-measure'

countCharacters('Hello world') // 11
```

The counting algorithm is pluggable via `options.algorithm` (defaults to `utf16`):

- `utf16` — UTF-16 code units (JS `String.length`). A surrogate pair (e.g. an emoji) counts as two.
- `codePoints` — Unicode code points. A surrogate pair counts as one.

```typescript
countCharacters('👍') // 2 (default: utf16)
countCharacters('👍', { algorithm: 'utf16' }) // 2
countCharacters('👍', { algorithm: 'codePoints' }) // 1
```

More algorithms (e.g. glyphs — à la XLIFF size-units) can be added over time. To measure the
encoded size of a text rather than its characters, use [`countBytes`](#countbytes).

By default the content wrapped between NTC tags is counted (only the marker tags are excluded). Set
`options.excludeNtc` to `true` to drop non-translatable content — the whole region, tags and wrapped
content — from the count:

```typescript
// NTC markers are two private-use code points: U+E101 (start) and U+E102 (end).
const text = 'a\uE101bc\uE102d' // "bc" is wrapped in NTC markers

countCharacters(text) // 4 — NTC content "bc" is counted
countCharacters(text, { excludeNtc: true }) // 2 — only "a" and "d" counted
```

## `countBytes`

Counts the size of a text in bytes — the size it takes in a database or a search index, which is
what storage limits are expressed in. The text is measured as given: NTC markers and the content
they wrap are counted like any other character.

```typescript
import { countBytes } from '@lokalise/text-measure'

countBytes('Hello') // 5
countBytes('你好') // 6
countBytes('👍') // 4
countBytes('a<b>') // 10 — each NTC marker is 3 bytes
```

The encoding is pluggable via `options.encoding` (defaults to `utf8`):

- `utf8` — UTF-8. A lone surrogate counts as three bytes, the size of the replacement character
  (U+FFFD) that UTF-8 encoders write in its place.

```typescript
countBytes('👍', { encoding: 'utf8' }) // 4
```

More encodings can be added over time.

## `countTranslatableWords`

Counts the translatable words in a text, excluding non-translatable content (NTC) and tags. Backed
by `gmx-word-counter`.

```typescript
import { countTranslatableWords } from '@lokalise/text-measure'

countTranslatableWords('Hello world') // 2
```

`options.locale` is a BCP47 language subtag used for word segmentation (defaults to `-`), so
logographic scripts are counted correctly:

```typescript
countTranslatableWords('你好世界', { locale: 'zh' })
```