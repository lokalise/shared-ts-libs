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

More algorithms (e.g. UTF-8 bytes, glyphs — à la XLIFF size-units) can be added over time.

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
