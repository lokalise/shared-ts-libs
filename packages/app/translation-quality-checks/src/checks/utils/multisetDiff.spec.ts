import { multisetDiff } from './multisetDiff.ts'

describe('multisetDiff', () => {
  it.each([
    { name: 'both empty', reference: [], current: [] },
    { name: 'identical lists', reference: ['a', 'b'], current: ['a', 'b'] },
    { name: 'same entries in a different order', reference: ['a', 'b'], current: ['b', 'a'] },
    { name: 'duplicates with the same count', reference: ['a', 'a'], current: ['a', 'a'] },
  ])('reports an empty diff: $name', ({ reference, current }) => {
    expect(multisetDiff(reference, current)).toEqual({ missing: [], added: [] })
  })

  it.each([
    {
      name: 'current adds an entry',
      reference: [],
      current: ['a'],
      expected: { missing: [], added: ['a'] },
    },
    {
      name: 'current drops an entry',
      reference: ['a'],
      current: [],
      expected: { missing: ['a'], added: [] },
    },
    {
      name: 'an entry is replaced by another',
      reference: ['a'],
      current: ['b'],
      expected: { missing: ['a'], added: ['b'] },
    },
    {
      name: 'duplicates are counted, not deduplicated',
      reference: ['a', 'a'],
      current: ['a'],
      expected: { missing: ['a'], added: [] },
    },
    {
      name: 'current duplicates an entry the reference has once',
      reference: ['a'],
      current: ['a', 'a'],
      expected: { missing: [], added: ['a'] },
    },
    {
      name: 'every unpaired duplicate is reported',
      reference: ['a', 'a', 'a'],
      current: ['b', 'b'],
      expected: { missing: ['a', 'a', 'a'], added: ['b', 'b'] },
    },
    {
      name: 'paired entries are not reported alongside unpaired ones',
      reference: ['a', 'b'],
      current: ['b', 'c'],
      expected: { missing: ['a'], added: ['c'] },
    },
  ])('reports the diff: $name', ({ reference, current, expected }) => {
    expect(multisetDiff(reference, current)).toEqual(expected)
  })
})
