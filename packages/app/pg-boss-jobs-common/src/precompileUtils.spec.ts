import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { isPrecompiledSchema, precompileSchema } from './precompileUtils.ts'

const buildSchema = () => z.object({ id: z.string() })

describe('precompileSchema', () => {
  afterEach(() => {
    z.config({ jitless: false })
  })

  it('returns one memoized clone per schema, and recognizes a clone it built', () => {
    const schema = buildSchema()

    const precompiled = precompileSchema(schema)

    expect(precompiled).not.toBe(schema)
    expect(isPrecompiledSchema(precompiled)).toBe(true)
    expect(precompileSchema(schema)).toBe(precompiled)
    expect(precompileSchema(precompiled)).toBe(precompiled)
    expect(precompiled.parse({ id: 'a' })).toEqual({ id: 'a' })
  })

  it('hands the schema back untouched when jitless is set', () => {
    z.config({ jitless: true })
    const schema = buildSchema()

    expect(precompileSchema(schema)).toBe(schema)
  })

  it('hands back a schema zod refuses to compile', () => {
    const schema = z.object({ id: z.string() }).refine(async () => true)

    expect(precompileSchema(schema)).toBe(schema)
    expect(isPrecompiledSchema(schema)).toBe(false)
  })
})
