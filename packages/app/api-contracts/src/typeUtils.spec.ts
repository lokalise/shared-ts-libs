import { describe, expectTypeOf, it } from 'vitest'
import type {
  DistributiveOmit,
  Exactly,
  IsUnion,
  KeysOfUnion,
  MayOmit,
  Prettify,
  ValueOf,
} from './typeUtils.ts'

type Shape = {
  id: string
  name: string
  optional?: number
}

describe('typeUtils', () => {
  describe('Prettify', () => {
    it('flattens an intersection into a single object type', () => {
      type Flattened = Prettify<{ a: string } & { b: number }>

      expectTypeOf<Flattened>().toEqualTypeOf<{ a: string; b: number }>()
    })
  })

  describe('IsUnion', () => {
    it('returns true for a union with more than one member', () => {
      expectTypeOf<IsUnion<'a' | 'b'>>().toEqualTypeOf<true>()
      expectTypeOf<IsUnion<string | number>>().toEqualTypeOf<true>()
    })

    it('returns false for a single-member type', () => {
      expectTypeOf<IsUnion<'a'>>().toEqualTypeOf<false>()
      expectTypeOf<IsUnion<Shape>>().toEqualTypeOf<false>()
    })
  })

  describe('Exactly', () => {
    it('leaves a type unchanged when it has no extra keys', () => {
      type Checked = Exactly<{ id: string }, Shape>

      expectTypeOf<Checked>().toEqualTypeOf<{ id: string }>()
    })

    it('maps extra keys to never, forcing an error at the call site', () => {
      type Checked = Exactly<{ id: string; extra: boolean }, Shape>

      expectTypeOf<Checked['extra']>().toEqualTypeOf<never>()
      expectTypeOf<Checked['id']>().toEqualTypeOf<string>()
    })
  })

  describe('MayOmit', () => {
    it('makes only the given keys optional', () => {
      type Relaxed = MayOmit<Shape, 'name'>

      expectTypeOf<Relaxed>().toEqualTypeOf<{ name?: string } & { id: string; optional?: number }>()
    })

    it('accepts objects that omit the relaxed keys', () => {
      const value: MayOmit<Shape, 'name'> = { id: '1' }

      expectTypeOf(value.name).toEqualTypeOf<string | undefined>()
      expectTypeOf(value.id).toEqualTypeOf<string>()
    })

    it('supports relaxing multiple keys at once', () => {
      const value: MayOmit<Shape, 'name' | 'id'> = {}

      expectTypeOf(value.id).toEqualTypeOf<string | undefined>()
    })
  })

  describe('KeysOfUnion', () => {
    it('returns the union of keys across all union members', () => {
      type Union = { a: string } | { b: number }

      expectTypeOf<KeysOfUnion<Union>>().toEqualTypeOf<'a' | 'b'>()
    })

    it('matches plain keyof for a non-union type', () => {
      expectTypeOf<KeysOfUnion<Shape>>().toEqualTypeOf<keyof Shape>()
    })
  })

  describe('DistributiveOmit', () => {
    it('omits a key from every union member separately', () => {
      type Union = { kind: 'a'; shared: string } | { kind: 'b'; shared: string; own: number }
      type Result = DistributiveOmit<Union, 'shared'>

      expectTypeOf<Result>().toEqualTypeOf<{ kind: 'a' } | { kind: 'b'; own: number }>()
    })

    it('accepts keys present on only some union members', () => {
      type Union = { kind: 'a' } | { kind: 'b'; own: number }
      type Result = DistributiveOmit<Union, 'own'>

      expectTypeOf<Result>().toEqualTypeOf<{ kind: 'a' } | { kind: 'b' }>()
    })
  })

  describe('ValueOf', () => {
    it('extracts the union of all value types', () => {
      expectTypeOf<ValueOf<Shape>>().toEqualTypeOf<string | number | undefined>()
    })

    it('extracts value types for a subset of keys', () => {
      expectTypeOf<ValueOf<Shape, 'id' | 'name'>>().toEqualTypeOf<string>()
    })
  })
})
