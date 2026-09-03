import { describe, expect, it } from 'vitest'
import {
  filterObjects,
  ODataEvaluationError,
  ODataParseError,
  UnsupportedConstructError,
} from './index.ts'

const users = [
  { id: 1, name: 'Alice', status: 'active', price: 15, tags: ['sale', 'new'] },
  { id: 2, name: 'Bob', status: 'archived', price: 5, tags: [] },
  {
    id: 3,
    name: "O'Brien",
    status: 'active',
    price: 50,
    address: { city: 'Berlin' },
    items: [{ quantity: 5 }, { quantity: 20 }],
    deletedAt: null,
  },
]

describe('filterObjects', () => {
  it('filters by equality', () => {
    const { items } = filterObjects("status eq 'active'", users)
    expect(items.map((u) => u.id)).toEqual([1, 3])
  })

  it('filters by numeric range with and', () => {
    const { items } = filterObjects('price gt 10 and price lt 100', users)
    expect(items.map((u) => u.id)).toEqual([1, 3])
  })

  it('filters with or', () => {
    const { items } = filterObjects("status eq 'archived' or price gt 40", users)
    expect(items.map((u) => u.id)).toEqual([2, 3])
  })

  it('filters with not and grouping', () => {
    const { items } = filterObjects("not (status eq 'active')", users)
    expect(items.map((u) => u.id)).toEqual([2])
  })

  it('treats missing properties as null in equality', () => {
    const { items } = filterObjects('deletedAt eq null', users)
    expect(items.map((u) => u.id)).toEqual([1, 2, 3])
  })

  it('filters nested properties', () => {
    const { items } = filterObjects("address/city eq 'Berlin'", users)
    expect(items.map((u) => u.id)).toEqual([3])
  })

  it('filters with string contains', () => {
    const { items } = filterObjects("contains(name, 'li')", users)
    expect(items.map((u) => u.id)).toEqual([1])
  })

  it('filters with startswith and endswith', () => {
    expect(filterObjects("startswith(name, 'Al')", users).items).toHaveLength(1)
    expect(filterObjects("endswith(name, 'en')", users).items).toHaveLength(1)
  })

  it('filters with collection any lambda', () => {
    const { items } = filterObjects('items/any(i:i/quantity gt 10)', users)
    expect(items.map((u) => u.id)).toEqual([3])
  })

  it('excludes when any lambda matches no items', () => {
    const data = [{ items: [{ quantity: 1 }] }]
    expect(filterObjects('items/any(i:i/quantity gt 10)', data).items).toHaveLength(0)
  })

  it('filters with collection all lambda', () => {
    const data = [{ tags: ['a', 'a'] }, { tags: ['a', 'b'] }]
    const { items } = filterObjects("tags/all(t:t eq 'a')", data)
    expect(items).toHaveLength(1)
  })

  it('filters with collection any() emptiness', () => {
    const { items } = filterObjects('tags/any()', users)
    expect(items.map((u) => u.id)).toEqual([1])
  })

  it('filters with collection $count', () => {
    const { items } = filterObjects('items/$count gt 1', users)
    expect(items.map((u) => u.id)).toEqual([3])
  })

  it('filters with parameter aliases', () => {
    const { items } = filterObjects('contains(name, @term)', users, {
      binds: { term: 'Ali' },
    })
    expect(items.map((u) => u.id)).toEqual([1])
  })

  it('treats missing alias bind as null', () => {
    const { items } = filterObjects('name eq @missing', users)
    expect(items).toHaveLength(0)
  })

  it('preserves input order and does not mutate objects', () => {
    const copy = users.map((u) => ({ ...u }))
    const { items } = filterObjects("status eq 'active'", copy)
    expect(items.map((u) => u.id)).toEqual([1, 3])
    expect(copy).toEqual(users.map((u) => ({ ...u })))
  })

  it('applies limit and sets truncated', () => {
    const { items, truncated } = filterObjects("status eq 'active'", users, { limit: 1 })
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(1)
    expect(truncated).toBe(true)
  })

  it('sets truncated false when limit not exceeded', () => {
    const { truncated } = filterObjects("status eq 'active'", users, { limit: 10 })
    expect(truncated).toBe(false)
  })

  it('throws on empty filter', () => {
    expect(() => filterObjects('   ', users)).toThrow(ODataParseError)
  })

  it('throws on invalid syntax', () => {
    expect(() => filterObjects('not a valid !!! filter', users)).toThrow(ODataParseError)
  })

  it('rejects in operator', () => {
    expect(() => filterObjects("status in ('active')", users)).toThrow(UnsupportedConstructError)
  })

  it('rejects substringof', () => {
    expect(() => filterObjects("substringof('a', name)", users)).toThrow(UnsupportedConstructError)
  })

  it('evaluates arithmetic in expressions', () => {
    const data = [{ total: 100, count: 5 }]
    const { items } = filterObjects('total div count gt 10', data)
    expect(items).toHaveLength(1)
  })

  it('throws on integer division by zero', () => {
    const data = [{ a: 1, b: 0 }]
    expect(() => filterObjects('a div b eq 0', data)).toThrow(ODataEvaluationError)
  })

  it('excludes items when expression is false or null', () => {
    const data = [{ value: null }, { value: 1 }]
    expect(filterObjects('value gt 0', data).items).toEqual([{ value: 1 }])
  })

  it('handles escaped quotes in strings', () => {
    const { items } = filterObjects("name eq 'O''Brien'", users)
    expect(items.map((u) => u.id)).toEqual([3])
  })
})
