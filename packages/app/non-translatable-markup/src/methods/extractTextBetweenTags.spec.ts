import { describe, expect, it } from 'vitest'
import { extractTextBetweenTags } from './extractTextBetweenTags.ts'

describe('extractTextBetweenTags', () => {
  it.each([
    { text: 'Hello, World', result: ['Hello, World'] }, // Without NT tags

    // NT tags - should be removed
    { text: 'Hello, \uE101World!\uE102', result: ['Hello,'] }, // Single region within NT tags
    {
      text: 'Hello, \uE101World!\uE102 How are you?',
      result: ['Hello,', 'How are you?'],
    }, // Single region within NT tags in the middle
    {
      text: 'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
      result: ['Hello,', 'How are you?'],
    }, // several regions within NT tags
    {
      text: ' \uE101Hello world!\uE102 ! 123\uE101I am fine!\uE102 ',
      result: ['! 123'],
    }, // several regions within NT tags with leading and trailing spaces
    {
      text: '\uE101\uE102\uE111\uE101\uE112\uE102',
      result: [],
    }, // duplicated NT tags inside of NT region
    {
      text: '\uE101\uE102\uE111\uE102\uE101\uE101\uE112\uE102',
      result: [],
    }, // consecutive NT regions with special inline codes inside

    // HTML tags - should be removed
    { text: 'Hello!<> world', result: ['Hello!', 'world'] },
    { text: '<div class="test">hello world</div>', result: ['hello world'] },
    { text: 'hello world</tr>', result: ['hello world'] },
    { text: 'Hello</br>world </br>', result: ['Hello', 'world'] },
    { text: '</tr>', result: [] },
    { text: '<tr>', result: [] },
    { text: '<p></p>', result: [] },
    { text: '<div class="test">\n\t&🚀</div>', result: ['&🚀'] }, // White characters are removed
    { text: '<tr', result: ['<tr'] }, // Unclosed tag

    // Symbols and emojis
    { text: '\n', result: [] },
    { text: '🔥', result: ['🔥'] },
  ])('should extract text pieces between tags (%#) with default options', (testcase) => {
    expect(extractTextBetweenTags(testcase.text)).toEqual(testcase.result)
  })

  it.each([
    {
      text: 'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
      result: ['Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102'],
    },
    {
      text: '<div>hello world</div>',
      result: ['hello world'],
    },
    {
      text: '<div>hello world</div>\uE101I am fine!\uE102',
      result: ['hello world', '\uE101I am fine!\uE102'],
    },
  ])('should extract text pieces between tags (%#) keeping NT', (testcase) => {
    expect(extractTextBetweenTags(testcase.text, { keepNtc: true })).toEqual(testcase.result)
  })

  it.each([
    {
      text: 'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
      result: ['Hello,', 'How are you?'],
    },
    {
      text: 'Hello, \uE101\uE101 World!\uE102 How are you? \uE101I am fine!\uE102',
      result: ['Hello,', 'How are you?'],
    },
    {
      text: '<div>hello world</div>',
      result: ['<div>hello world</div>'],
    },
    {
      text: '<div>hello world</div>\uE101I am fine!\uE102',
      result: ['<div>hello world</div>'],
    },
  ])('should extract text pieces between tags (%#) keeping HTML', (testcase) => {
    expect(extractTextBetweenTags(testcase.text, { keepHtml: true })).toEqual(testcase.result)
  })

  it.each([
    {
      text: 'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102',
    },
    {
      text: '<div>hello world</div>',
    },
    {
      text: '<div>hello world</div>\uE101I am fine!\uE102',
    },
  ])('should extract text pieces between tags (%#) keeping HTML and NT', (testcase) => {
    expect(
      extractTextBetweenTags(testcase.text, {
        keepHtml: true,
        keepNtc: true,
      }),
    ).toEqual([testcase.text])
  })

  it.each([
    // NT region glued to punctuation: original spacing must survive so that
    // joining the pieces with '' does not invent or drop spaces
    {
      text: 'Through their \uE101{op:1}\uE102strategic partnership\uE101{cl:1}\uE102, the experts',
      result: ['Through their ', 'strategic partnership', ', the experts'],
    },
    // Whitespace-only pieces between NT regions are kept
    {
      text: 'foo \uE101{op:1}\uE102 \uE101{cl:1}\uE102bar',
      result: ['foo ', ' ', 'bar'],
    },
    // Leading and trailing whitespace is kept
    {
      text: ' Hello \uE101World!\uE102 ',
      result: [' Hello ', ' '],
    },
    // Adjacent NT regions produce no empty pieces
    {
      text: 'experience\uE101{ph:1}\uE102\uE101{op:2}\uE1024 steps',
      result: ['experience', '4 steps'],
    },
    // HTML tags are still split out when keepHtml is not set
    {
      text: 'Hello</br>world',
      result: ['Hello', 'world'],
    },
  ])('should extract text pieces between tags (%#) preserving spacing', (testcase) => {
    expect(extractTextBetweenTags(testcase.text, { preserveSpacing: true })).toEqual(
      testcase.result,
    )
  })

  it('should preserve spacing while keeping HTML', () => {
    expect(
      extractTextBetweenTags('Their \uE101{op:1}\uE102<b>partnership</b>\uE101{cl:1}\uE102, ok', {
        keepHtml: true,
        preserveSpacing: true,
      }),
    ).toEqual(['Their ', '<b>partnership</b>', ', ok'])
  })
})
