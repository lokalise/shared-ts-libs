import { leadingWhitespaceCheck } from './leadingWhitespaceCheck.ts'

describe('leadingWhitespaceCheck', () => {
  it.each([
    { name: 'no leading whitespace', text: 'Hello' },
    { name: 'empty string', text: '' },
    { name: 'inner whitespace only', text: 'Hello world' },
    { name: 'trailing whitespace only', text: 'Hello ' },
  ])('reports no issue: $name', ({ text }) => {
    expect(leadingWhitespaceCheck(text)).toBeUndefined()
  })

  it.each([
    { name: 'single space', text: ' Hello' },
    { name: 'multiple characters', text: '  Hello' },
    { name: 'tab', text: '\tHello' },
    { name: 'whitespace-only text', text: '  ' },
  ])('reports the issue: $name', ({ text }) => {
    expect(leadingWhitespaceCheck(text)).toEqual({
      error: 'LEADING_WHITESPACE',
      details: undefined,
    })
  })
})
