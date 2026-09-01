import { trailingWhitespaceMismatchCheck } from './trailingWhitespaceMismatchCheck.ts'

describe('trailingWhitespaceMismatchCheck', () => {
  it.each([
    { name: 'no trailing whitespace on either side', text: 'Hola', compareWith: 'Hello' },
    { name: 'identical trailing whitespace', text: 'Hola ', compareWith: 'Hello ' },
    { name: 'empty strings', text: '', compareWith: '' },
  ])('reports no issue: $name', ({ text, compareWith }) => {
    expect(trailingWhitespaceMismatchCheck(text, compareWith)).toBeNull()
  })

  it.each([
    {
      name: 'text adds trailing whitespace',
      text: 'Hola ',
      compareWith: 'Hello',
      details: { source: '', target: ' ' },
    },
    {
      name: 'text drops trailing whitespace',
      text: 'Hola',
      compareWith: 'Hello ',
      details: { source: ' ', target: '' },
    },
    {
      name: 'different whitespace kind',
      text: 'Hola ',
      compareWith: 'Hello\n',
      details: { source: '\n', target: ' ' },
    },
    {
      name: 'different whitespace length',
      text: 'Hola ',
      compareWith: 'Hello  ',
      details: { source: '  ', target: ' ' },
    },
  ])('reports a mismatch: $name', ({ text, compareWith, details }) => {
    expect(trailingWhitespaceMismatchCheck(text, compareWith)).toEqual({
      error: 'TRAILING_WHITESPACE_MISMATCH',
      details,
    })
  })
})
