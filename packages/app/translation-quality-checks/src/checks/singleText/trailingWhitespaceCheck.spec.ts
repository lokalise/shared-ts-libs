import { trailingWhitespaceCheck } from './trailingWhitespaceCheck.ts'

describe('trailingWhitespaceCheck', () => {
  it.each([
    { name: 'no trailing whitespace', text: 'Hello' },
    { name: 'empty string', text: '' },
    { name: 'inner whitespace only', text: 'Hello world' },
    { name: 'leading whitespace only', text: ' Hello' },
  ])('reports no issue: $name', ({ text }) => {
    expect(trailingWhitespaceCheck(text)).toBeUndefined()
  })

  it.each([
    { name: 'single space', text: 'Hello ' },
    { name: 'multiple characters', text: 'Hello  ' },
    { name: 'newline', text: 'Hello\n' },
    { name: 'whitespace-only text', text: '  ' },
  ])('reports the issue: $name', ({ text }) => {
    expect(trailingWhitespaceCheck(text)).toEqual({
      error: 'TRAILING_WHITESPACE',
      details: undefined,
    })
  })
})
