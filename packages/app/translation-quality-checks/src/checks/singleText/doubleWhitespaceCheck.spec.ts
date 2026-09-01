import {
  NON_TRANSLATABLE_END_TAG as NTC_END,
  NON_TRANSLATABLE_START_TAG as NTC_START,
} from '@lokalise/non-translatable-markup'
import { doubleWhitespaceCheck } from './doubleWhitespaceCheck.ts'

describe('doubleWhitespaceCheck', () => {
  it.each([
    { name: 'no double whitespace', text: 'a b c' },
    { name: 'empty string', text: '' },
    {
      name: 'double whitespace inside an NTC region is ignored',
      text: `a${NTC_START}x  y${NTC_END}b`,
    },
    {
      name: 'whitespace around an NTC region does not form a run',
      text: `a ${NTC_START}x${NTC_END} b`,
    },
  ])('reports no issue: $name', ({ text }) => {
    expect(doubleWhitespaceCheck(text)).toBeNull()
  })

  it.each([
    { name: 'double space', text: 'a  b', whitespaces: ['  '] },
    { name: 'longer run is a single entry', text: 'a   b', whitespaces: ['   '] },
    { name: 'mixed whitespace run', text: 'a \tb', whitespaces: [' \t'] },
    {
      name: 'multiple runs are all reported',
      text: 'a  b   c',
      whitespaces: ['  ', '   '],
    },
    {
      name: 'only the runs outside NTC regions are reported',
      text: `a  ${NTC_START}x  y${NTC_END} b`,
      whitespaces: ['  '],
    },
  ])('reports the runs: $name', ({ text, whitespaces }) => {
    expect(doubleWhitespaceCheck(text)).toEqual({
      error: 'DOUBLE_WHITESPACE',
      details: { whitespaces },
    })
  })
})
