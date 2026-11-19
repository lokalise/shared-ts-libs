# @lokalise/text-measure

## 1.3.0

### Minor Changes

- dce9424: Add `countBytes`, which counts the encoded size of a text in bytes, NTC markers included. The encoding is selected with `options.encoding` (`ByteCountEncodingEnum`); `utf8` is the only one and the default.

## 1.2.0

### Minor Changes

- 6b54732: Add `excludeNtc` option to `countCharacters` to exclude non-translatable content (text wrapped between NTC tags) from the count. Defaults to `false`, preserving the current behavior of counting the wrapped content.

## 1.1.0

### Minor Changes

- eca389f: Export `CharacterCountAlgorithmEnum` const object and derive `CharacterCountAlgorithm` type from it.

## 1.0.0

### Major Changes

- 29e2186: Add `@lokalise/text-measure`, utilities to measure text:

  - `countCharacters` — NTC-aware character count with a pluggable algorithm (`utf16` / `codePoints`).
  - `countTranslatableWords` — NTC- and tag-aware, locale-aware word count.
