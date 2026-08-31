import { describe, expect, it } from 'vitest'
import { extractNTCTagsWithContent } from './extractNTCTagsWithContent.ts'

describe('extractNTCTagsWithContent', () => {
  it.each([
    ['text without NTC regions', 'Hello world', []],
    ['single region', 'Hello \uE101%{name}\uE102', ['\uE101%{name}\uE102']],
    [
      'multiple regions in order of appearance',
      '\uE101<b>\uE102Hello\uE101%{name}\uE102 world',
      ['\uE101<b>\uE102', '\uE101%{name}\uE102'],
    ],
    [
      'duplicated regions are all extracted',
      '\uE101<br>\uE102 Hello \uE101<br>\uE102',
      ['\uE101<br>\uE102', '\uE101<br>\uE102'],
    ],
    ['lone start tag is not a region', '\uE101{% if %} Hello', []],
    ['lone end tag is not a region', '{% if %}\uE102 Hello', []],
    ['empty region is not extracted', 'Hello \uE101\uE102 world', []],
    ['empty string', '', []],
  ])('%s', (_name, text, expected) => {
    expect(extractNTCTagsWithContent(text)).toEqual(expected)
  })
})
