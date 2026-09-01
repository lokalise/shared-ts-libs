import { leadingWhitespaceMismatchCheck } from './leadingWhitespaceMismatchCheck.ts'

describe('leadingWhitespaceMismatchCheck', () => {
  it.each([
    { name: 'no leading whitespace on either side', text: 'Hola', source: 'Hello' },
    { name: 'identical leading whitespace', text: ' Hola', source: ' Hello' },
    { name: 'empty strings', text: '', source: '' },
  ])('reports no issue: $name', ({ text, source }) => {
    expect(leadingWhitespaceMismatchCheck(text, source)).toBeNull()
  })

  it.each([
    {
      name: 'text adds leading whitespace',
      text: ' Hola',
      source: 'Hello',
      details: { source: '', target: ' ' },
    },
    {
      name: 'text drops leading whitespace',
      text: 'Hola',
      source: ' Hello',
      details: { source: ' ', target: '' },
    },
    {
      name: 'different whitespace kind',
      text: ' Hola',
      source: '\tHello',
      details: { source: '\t', target: ' ' },
    },
    {
      name: 'different whitespace length',
      text: ' Hola',
      source: '  Hello',
      details: { source: '  ', target: ' ' },
    },
  ])('reports a mismatch: $name', ({ text, source, details }) => {
    expect(leadingWhitespaceMismatchCheck(text, source)).toEqual({
      error: 'LEADING_WHITESPACE_MISMATCH',
      details,
    })
  })
})
