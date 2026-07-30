import { describe, expect, it } from 'vitest'
import {
  base64urlToString,
  type ConversionMode,
  decodeCursor,
  encodeCursor,
  stringToBase64url,
} from './cursorCodec.ts'

describe('cursorCodec', () => {
  describe('encode and decode', () => {
    it('encode and decode works', () => {
      const testValue = {
        id: '1',
        name: 'apple',
        sub: { id: 1 },
        array1: ['1', '2'],
        array2: [{ name: 'hello' }, { name: 'world' }],
      }
      expect(decodeCursor(encodeCursor(testValue))).toEqual({ result: testValue })
    })

    it('trying to decode not encoded text', () => {
      const result = decodeCursor('should fail')
      expect(result.error).toBeDefined()
      expect((result.error as Error).message).toContain('is not valid JSON')
    })
  })

  describe('base64url conversion', () => {
    const testValue = {
      id: '1',
      name: 'apple',
      sub: { id: 1 },
      array1: ['1', '2'],
      array2: [{ name: 'hello' }, { name: 'world' }],
    }
    const stringifiedValue = JSON.stringify(testValue)

    it.each([
      ['buffer', 'buffer'],
      ['buffer', 'atob-btoa'],
      ['atob-btoa', 'buffer'],
      ['atob-btoa', 'atob-btoa'],
    ] satisfies [ConversionMode, ConversionMode][])(
      'works properly for modes (encoding: %s, decoding: %s)',
      (encodingMode, decodingMode) => {
        const encoded = stringToBase64url(stringifiedValue, encodingMode)
        const decoded = base64urlToString(encoded, decodingMode)

        expect(decoded).toStrictEqual(stringifiedValue)
        expect(JSON.parse(decoded)).toStrictEqual(testValue)
      },
    )
  })
})
