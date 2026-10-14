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
    expect(extractTextBetweenTags(testcase.text, { ntc: 'keep' })).toEqual(testcase.result)
    // Covering deprecated keepNtc option
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
        ntc: 'keep',
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

  it.each([
    // NTC region wrapping an element with content - should be extracted
    {
      text: 'Welcome to \uE101<notrans>My House</notrans>\uE102',
      result: ['Welcome to My House'],
    }, // Single NTC element
    { text: '\uE101<x id="1">Foo</x>\uE102 bar', result: ['Foo bar'] }, // Element with attributes
    { text: '\uE101<ns:tag>Foo</ns:tag>\uE102', result: ['Foo'] }, // Element with namespaced name
    { text: 'Hi \uE101<b>A</b>\uE102 and \uE101<i>B</i>\uE102', result: ['Hi A and B'] }, // Several NTC elements
    { text: '\uE101<n>My <b>House</b></n>\uE102', result: ['My', 'House'] }, // Nested HTML is split out
    { text: '\uE101<a>Hi <abbr>there</abbr></a>\uE102', result: ['Hi', 'there'] }, // Nested tag with a longer name

    // Any other NTC region - should be removed
    { text: 'Hello \uE101World!\uE102', result: ['Hello'] }, // Not an element
    { text: 'a \uE101{op:1}\uE102 b', result: ['a', 'b'] }, // Inline code
    { text: 'a \uE101<br/>\uE102 b', result: ['a', 'b'] }, // Self-closing tag
    { text: 'a \uE101<n></n>\uE102 b', result: ['a', 'b'] }, // Empty element
    { text: 'a \uE101<n>  </n>\uE102 b', result: ['a', 'b'] }, // Whitespace-only element
    { text: 'a \uE101<a>x</b>\uE102 b', result: ['a', 'b'] }, // Closing tag does not match
    { text: 'a \uE101<a>x</a> y\uE102 b', result: ['a', 'b'] }, // Text outside the element
    { text: 'a \uE101<a>x</a><a>y</a>\uE102 b', result: ['a', 'b'] }, // Several elements in one NTC region
    { text: 'a \uE101<a>x <a>y</a></a>\uE102 b', result: ['a', 'b'] }, // Nested element with the same tag

    // NTC element between other NTC regions
    {
      text: '\uE101{op:1}\uE102Welcome to \uE101<n>My House</n>\uE102\uE101{cl:1}\uE102',
      result: ['Welcome to My House'],
    },
  ])('should extract text pieces between tags (%#) extracting NTC element text', (testcase) => {
    expect(extractTextBetweenTags(testcase.text, { ntc: 'extractElementText' })).toEqual(
      testcase.result,
    )
  })

  it.each([
    // Extracted text is glued to the surrounding text without inventing or dropping spaces
    {
      text: 'Welcome to \uE101<notrans>My House</notrans>\uE102!',
      result: ['Welcome to My House!'],
    },
    // Nested HTML is kept
    { text: '\uE101<n>My <b>House</b></n>\uE102', result: ['My <b>House</b>'] },
    // Only elements inside NTC regions are extracted
    {
      text: 'Hi \uE101{op:1}\uE102<n>x</n>, \uE101<n>y</n>\uE102 ok',
      result: ['Hi ', '<n>x</n>, y ok'],
    },
  ])(
    'should extract text pieces between tags (%#) extracting NTC element text while keeping HTML and spacing',
    (testcase) => {
      expect(
        extractTextBetweenTags(testcase.text, {
          ntc: 'extractElementText',
          keepHtml: true,
          preserveSpacing: true,
        }),
      ).toEqual(testcase.result)
    },
  )
})
