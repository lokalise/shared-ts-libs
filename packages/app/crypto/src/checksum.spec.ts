import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { calculateChecksum, calculateStreamChecksum } from './checksum.ts'

const testObject = {
  someField: 123,
  someOtherField: 'ferfref',
  nestedField: { level2: { level3: { level4: { value: 'some string' } } } },
}
const testObjectChecksum = '9d15391c6fea84d122e0b22f7b9eb90f'

describe('calculateChecksum', () => {
  it('keeps the checksum format stable', () => {
    expect(
      calculateChecksum({ id: 1, tags: ['a'], meta: new Map([['k', 1n]]) }),
    ).toMatchInlineSnapshot(`"17bea9e2822d5faaf6f630306a74e225"`)
  })

  it('gives values of different types different checksums', () => {
    const values = [
      undefined,
      null,
      0,
      false,
      0n,
      'abc',
      ['abc'],
      new Set(['abc']),
      {},
      [],
      new Map(),
      new Set(),
      new Date(0),
    ]

    const checksums = new Set(values.map(calculateChecksum))

    expect(checksums.size).toBe(values.length)
  })

  it('hashes strings and bytes as plain MD5', () => {
    const md5OfAbc = '900150983cd24fb0d6963f7d28e17f72'

    expect(calculateChecksum('abc')).toBe(md5OfAbc)
    expect(calculateChecksum(Buffer.from('abc'))).toBe(md5OfAbc)
    expect(calculateChecksum(new TextEncoder().encode('abc'))).toBe(md5OfAbc)
  })

  it('hashes ArrayBuffers as their raw bytes', () => {
    const md5OfAbc = '900150983cd24fb0d6963f7d28e17f72'
    const shared = new SharedArrayBuffer(3)
    new Uint8Array(shared).set(new TextEncoder().encode('abc'))

    expect(calculateChecksum(new TextEncoder().encode('abc').buffer)).toBe(md5OfAbc)
    expect(calculateChecksum(shared)).toBe(md5OfAbc)
  })

  it('ignores object key order', () => {
    expect(calculateChecksum({ a: 1, b: { c: 2, d: 3 } })).toBe(
      calculateChecksum({ b: { d: 3, c: 2 }, a: 1 }),
    )
  })

  it('keeps array order', () => {
    expect(calculateChecksum([1, 2])).not.toBe(calculateChecksum([2, 1]))
  })

  it('hashes Maps by content, regardless of insertion order', () => {
    const map = new Map<unknown, unknown>([
      ['a', 1],
      [{ id: 2 }, 'b'],
    ])
    const reordered = new Map<unknown, unknown>([
      [{ id: 2 }, 'b'],
      ['a', 1],
    ])

    expect(calculateChecksum(map)).toBe(calculateChecksum(reordered))
    expect(calculateChecksum(map)).not.toBe(calculateChecksum(new Map([['a', 2]])))
  })

  it('hashes Sets by content, regardless of insertion order', () => {
    expect(calculateChecksum(new Set([1, 2]))).toBe(calculateChecksum(new Set([2, 1])))
    expect(calculateChecksum(new Set([1, 2]))).not.toBe(calculateChecksum(new Set([1, 3])))
  })

  it('hashes binary values by their bytes', () => {
    const bytes = [1, 2, 255]
    const checksum = calculateChecksum(Buffer.from(bytes))

    expect(calculateChecksum(new Uint8Array(bytes))).toBe(checksum)
    expect(calculateChecksum(Buffer.from([0, ...bytes]).subarray(1))).toBe(checksum)
  })

  it('distinguishes a missing key from one set to undefined', () => {
    expect(calculateChecksum({ a: undefined })).not.toBe(calculateChecksum({}))
  })

  it('hashes objects with toJSON by its result', () => {
    const withToJson = { secret: 'ignored', toJSON: () => 'visible' }

    expect(calculateChecksum(withToJson)).toBe(
      calculateChecksum({ secret: 'different', toJSON: () => 'visible' }),
    )
    expect(calculateChecksum(withToJson)).not.toBe(calculateChecksum({ toJSON: () => 'other' }))
  })

  it('accepts the same object referenced twice', () => {
    const shared = { id: 1 }

    expect(calculateChecksum([shared, shared])).toBe(calculateChecksum([{ id: 1 }, { id: 1 }]))
  })

  it('ignores symbol keys', () => {
    const key = Symbol('key')

    expect(calculateChecksum({ a: 1, [key]: 2 })).toBe(calculateChecksum({ a: 1 }))
  })

  it('hashes functions by their source', () => {
    expect(calculateChecksum({ f: (a: number) => a })).toBe(
      calculateChecksum({ f: (a: number) => a }),
    )
    expect(calculateChecksum({ f: (a: number) => a })).not.toBe(
      calculateChecksum({ f: (a: number) => a + 1 }),
    )
  })

  it('hashes circular structures without throwing', () => {
    const circular: Record<string, unknown> = { id: 1 }
    circular.self = circular
    const otherCircular: Record<string, unknown> = { id: 2 }
    otherCircular.self = otherCircular

    expect(calculateChecksum(circular)).not.toBe(calculateChecksum(otherCircular))
  })
})

describe('calculateStreamChecksum', () => {
  it('returns the checksum of a stream of strings', async () => {
    const json = JSON.stringify(testObject)
    const readable = Readable.from([json.slice(0, 10), json.slice(10)])

    await expect(calculateStreamChecksum(readable)).resolves.toBe(testObjectChecksum)
  })

  it('returns the checksum of a stream of buffers', async () => {
    const readable = Readable.from([Buffer.from([0, 1]), Buffer.from([2, 255])])

    await expect(calculateStreamChecksum(readable)).resolves.toBe(
      '0416dab819887333af831f8c765ac2ae',
    )
  })

  it('rejects when the stream errors', async () => {
    const error = new Error('read failed')
    const readable = new Readable({
      read() {
        this.destroy(error)
      },
    })

    await expect(calculateStreamChecksum(readable)).rejects.toBe(error)
  })
})
