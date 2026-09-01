import {
  NON_TRANSLATABLE_END_TAG as NTC_END,
  NON_TRANSLATABLE_START_TAG as NTC_START,
} from '@lokalise/non-translatable-markup'
import { doubleWhitespaceMismatchCheck } from './doubleWhitespaceMismatchCheck.ts'

describe('doubleWhitespaceMismatchCheck', () => {
  it.each([
    { name: 'no double whitespace on either side', text: 'a b', compareWith: 'x y' },
    { name: 'same double whitespace runs', text: 'a  b', compareWith: 'x  y' },
    {
      name: 'same runs regardless of position',
      text: 'a  b   c',
      compareWith: 'x   y  z',
    },
    { name: 'empty strings', text: '', compareWith: '' },
    {
      name: 'double whitespace inside NTC regions is ignored on both sides',
      text: `a${NTC_START}x  y${NTC_END}b`,
      compareWith: 'x y',
    },
  ])('reports no issue: $name', ({ text, compareWith }) => {
    expect(doubleWhitespaceMismatchCheck(text, compareWith)).toBeNull()
  })

  it.each([
    {
      name: 'text introduces a double whitespace',
      text: 'a  b',
      compareWith: 'x y',
      details: { missing: [], added: ['  '] },
    },
    {
      name: 'text drops a double whitespace',
      text: 'a b',
      compareWith: 'x  y',
      details: { missing: ['  '], added: [] },
    },
    {
      name: 'run lengths differ',
      text: 'a   b',
      compareWith: 'x  y',
      details: { missing: ['  '], added: ['   '] },
    },
    {
      name: 'text has an extra run (the matching one is not reported)',
      text: 'a  b  c',
      compareWith: 'x  y',
      details: { missing: [], added: ['  '] },
    },
  ])('reports a mismatch: $name', ({ text, compareWith, details }) => {
    expect(doubleWhitespaceMismatchCheck(text, compareWith)).toEqual({
      error: 'DOUBLE_WHITESPACE_MISMATCH',
      details,
    })
  })
})
