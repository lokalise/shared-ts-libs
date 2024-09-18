import { describe, expect, it } from 'vitest'
import {extractTranslatableTextPieces} from "./extractTranslatableTextPieces";

describe('extractTranslatableTextPieces', () => {
  it.each([
    { text: 'Hello, World', result: ['Hello, World'] }, // Without NT tags

    // NT tags - should be removed
    { text: 'Hello, \uE101World!\uE102', result: ['Hello,'] }, // Single region within NT tags
    { text: 'Hello, \uE101World!\uE102 How are you?', result: ['Hello,', 'How are you?'] }, // Single region within NT tags in the middle
    { text: 'Hello, \uE101World!\uE102 How are you? \uE101I am fine!\uE102', result: ['Hello,', 'How are you?'] }, // several regions within NT tags
    { text: ' \uE101Hello world!\uE102 ! 123\uE101I am fine!\uE102 ', result: ['! 123'] }, // several regions within NT tags with leading and trailing spaces

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
  ])('should extract text pieces between tags (%#)', (testcase) => {
    expect(extractTranslatableTextPieces(testcase.text)).toEqual(testcase.result)
  })
})
