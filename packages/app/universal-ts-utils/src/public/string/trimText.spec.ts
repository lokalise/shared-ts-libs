import { describe, expect, it } from 'vitest'
import { trimText } from './trimText.ts'

describe('trimText', () => {
  it('handles empty string', () => {
    const result = trimText('')
    expect(result).toEqual({ value: '' })
  })

  it.each([
    ['text', { value: 'text' }],
    [' text ', { value: 'text', prefix: ' ', suffix: ' ' }],
    ['     text     ', { value: 'text', prefix: '     ', suffix: '     ' }],
    ['\ttext\t', { value: 'text', prefix: '\t', suffix: '\t' }],
    [' \t  \t text\t  \t', { value: 'text', prefix: ' \t  \t ', suffix: '\t  \t' }],
    ['\ntext\n', { value: 'text', prefix: '\n', suffix: '\n' }],
    [' \n  \n text\n   \n ', { value: 'text', prefix: ' \n  \n ', suffix: '\n   \n ' }],
    ['&nbsp;text&nbsp;', { value: 'text', prefix: '&nbsp;', suffix: '&nbsp;' }],
    ['\r\ntext\r\n', { value: 'text', prefix: '\r\n', suffix: '\r\n' }],
    [
      '  \t \n &nbsp; \r\n \ttext\t \n &nbsp; \r\n \t ',
      {
        value: 'text',
        prefix: '  \t \n &nbsp; \r\n \t',
        suffix: '\t \n &nbsp; \r\n \t ',
      },
    ],
  ])('trim text and return prefix and suffix', (text, expected) => {
    const result = trimText(text)
    expect(result).toEqual(expected)
  })

  it.each([
    ['hello world', { value: 'hello world' }],
    [' hello world ', { value: 'hello world', prefix: ' ', suffix: ' ' }],
    [' hello\tworld ', { value: 'hello\tworld', prefix: ' ', suffix: ' ' }],
    [' hello\nworld ', { value: 'hello\nworld', prefix: ' ', suffix: ' ' }],
    [' hello\r\nworld ', { value: 'hello\r\nworld', prefix: ' ', suffix: ' ' }],
    [' hello&nbsp;world ', { value: 'hello&nbsp;world', prefix: ' ', suffix: ' ' }],
    [
      ' hello  \t \n &nbsp; \r\n \t world ',
      { value: 'hello  \t \n &nbsp; \r\n \t world', prefix: ' ', suffix: ' ' },
    ],
  ])('should not touch text itself', (text, expected) => {
    const result = trimText(text)
    expect(result).toEqual(expected)
  })
})
