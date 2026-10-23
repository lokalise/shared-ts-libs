---
'@lokalise/non-translatable-markup': patch
---

Recognize non-translatable regions that span several lines. The region patterns used `.`, which doesn't match line breaks, so a region containing `\n` was not detected: `isTextTranslatable` treated its content as translatable, `removeNonTranslatableTags` left its tags in place, and `extractNTCTagsWithContent`, `extractTextBetweenTags` and `isAttemptToEditNonTranslatableContent` ignored it.
