import {
  NON_TRANSLATABLE_END_TAG as NTC_END,
  NON_TRANSLATABLE_START_TAG as NTC_START,
} from '@lokalise/non-translatable-markup'
import { doubleWhitespaceRuns } from './doubleWhitespaceRuns.ts'

describe('doubleWhitespaceRuns', () => {
  it.each([
    { name: 'no double whitespace', text: 'a b c' },
    { name: 'empty string', text: '' },
    { name: 'CRLF line ending', text: 'Line one\r\nLine two' },
    { name: 'paragraph break', text: 'a\n\nb' },
    {
      name: 'double whitespace inside an NTC region',
      text: `a${NTC_START}x  y${NTC_END}b`,
    },
    {
      name: 'whitespace around an NTC region does not form a run',
      text: `a ${NTC_START}x${NTC_END} b`,
    },
  ])('extracts no runs: $name', ({ text }) => {
    expect(doubleWhitespaceRuns(text)).toEqual([])
  })

  it.each([
    { name: 'double space', text: 'a  b', runs: ['  '] },
    { name: 'longer run is a single entry', text: 'a   b', runs: ['   '] },
    { name: 'mixed horizontal whitespace', text: 'a \tb', runs: [' \t'] },
    {
      name: 'multiple runs in order of appearance',
      text: 'a  b   c',
      runs: ['  ', '   '],
    },
    {
      name: 'newline splits a run into its horizontal parts',
      text: 'a  \n  b',
      runs: ['  ', '  '],
    },
    {
      name: 'runs outside NTC regions are still extracted',
      text: `a  ${NTC_START}x  y${NTC_END} b  c`,
      runs: ['  ', '  '],
    },
  ])('extracts the runs: $name', ({ text, runs }) => {
    expect(doubleWhitespaceRuns(text)).toEqual(runs)
  })
})
