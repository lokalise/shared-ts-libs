import {
  NON_TRANSLATABLE_END_TAG as NTC_END,
  NON_TRANSLATABLE_START_TAG as NTC_START,
} from '@lokalise/non-translatable-markup'
import { nonTranslatableTagsMismatchCheck } from './nonTranslatableTagsMismatchCheck.ts'

const ntc = (token: string) => `${NTC_START}${token}${NTC_END}`

describe('nonTranslatableTagsMismatchCheck', () => {
  it.each([
    { name: 'no NTC tokens on either side', text: 'Hola', compareWith: 'Hello' },
    {
      name: 'same token on both sides',
      text: `Hola ${ntc('%{name}')}`,
      compareWith: `Hello ${ntc('%{name}')}`,
    },
    {
      name: 'same tokens regardless of position',
      text: `${ntc('<b>')}Hola${ntc('%{name}')}`,
      compareWith: `Hello ${ntc('%{name}')} ${ntc('<b>')}`,
    },
    {
      name: 'duplicated token with the same count',
      text: `${ntc('<br>')}Hola${ntc('<br>')}`,
      compareWith: `Hello${ntc('<br>')}${ntc('<br>')}`,
    },
    { name: 'empty strings', text: '', compareWith: '' },
  ])('reports no issue: $name', ({ text, compareWith }) => {
    expect(nonTranslatableTagsMismatchCheck(text, compareWith)).toBeNull()
  })

  it.each([
    {
      name: 'text drops a token',
      text: 'Hola',
      compareWith: `Hello ${ntc('%{name}')}`,
      details: { missing: ['%{name}'], added: [] },
    },
    {
      name: 'text adds a token',
      text: `Hola ${ntc('<b>')}`,
      compareWith: 'Hello',
      details: { missing: [], added: ['<b>'] },
    },
    {
      name: 'text alters a token',
      text: `Hola ${ntc('%{nome}')}`,
      compareWith: `Hello ${ntc('%{name}')}`,
      details: { missing: ['%{name}'], added: ['%{nome}'] },
    },
    {
      name: 'duplicated token dropped once (the matching one is not reported)',
      text: `Hola ${ntc('<br>')}`,
      compareWith: `Hello ${ntc('<br>')} bye ${ntc('<br>')}`,
      details: { missing: ['<br>'], added: [] },
    },
  ])('reports a mismatch: $name', ({ text, compareWith, details }) => {
    expect(nonTranslatableTagsMismatchCheck(text, compareWith)).toEqual({
      error: 'NON_TRANSLATABLE_TAGS_MISMATCH',
      details,
    })
  })
})
