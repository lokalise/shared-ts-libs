# @lokalise/non-translatable-markup

## 3.4.1

### Patch Changes

- 62cc33b: Recognize non-translatable regions that span several lines. The region patterns used `.`, which doesn't match line breaks, so a region containing `\n` was not detected: `isTextTranslatable` treated its content as translatable, `removeNonTranslatableTags` left its tags in place, and `extractNTCTagsWithContent`, `extractTextBetweenTags` and `isAttemptToEditNonTranslatableContent` ignored it.

## 3.4.0

### Minor Changes

- 13aaeb7: Add `ntc` option to `extractTextBetweenTags` (`remove` | `keep` | `extractElementText`) to show the text of NTC regions that wrap a single element, and deprecate `keepNtc`.

## 3.3.0

### Minor Changes

- b2b7df8: Export `extractNTCTagsWithContent`, which extracts every non-translatable region of a text (the
  NTC tags and the content they wrap) in order of appearance. Previously an internal helper of
  `isAttemptToEditNonTranslatableContent`.

## 3.2.0

### Minor Changes

- 344d565: Add `preserveSpacing` option to `extractTextBetweenTags`. When set, the extracted pieces keep their original whitespace (no trimming) and whitespace-only pieces are preserved, so joining the pieces with `''` reconstructs the original text minus the removed regions — without inventing or dropping spaces around them.
