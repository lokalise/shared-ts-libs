import { areNonTranslatableTagsComplementary } from './areNonTranslatableTagsComplementary.ts'

describe('areNonTranslatableTagsComplementary', () => {
  it.each([
    'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
    'Hello world',
    '',
    'Hello, \uE101\uE102',
    '\uE101\uE102',
    '\uE101\uE102\uE111\uE101\uE112\uE102',

    // NT region containing start tag
    'Hello, \uE101World! How are you? \uE101I am fine!\uE102',
    '\uE101\uE101\uE102',
  ])('returns true if there are no unclosed tags (%#)', (text) => {
    expect(areNonTranslatableTagsComplementary(text)).toEqual(true)
  })

  it.each([
    'Hello, World!\uE102 How are you? \uE101I am fine!\uE102',
    'Hello, \uE101World!\uE102 How are you? \uE101I am fine!',
    'Hello, \uE101',
    '\uE102',
    'Hello, \uE101World!\uE102 How are you? I am fine!\uE102',
  ])('returns false if there are unclosed tags (%#)', (text) => {
    expect(areNonTranslatableTagsComplementary(text)).toEqual(false)
  })
})
