import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  generateChecksumForBufferOrString,
  generateChecksumForObject,
  generateChecksumForReadable,
} from './checksumUtils.ts'

const testObject = {
  someField: 123,
  someOtherField: 'ferfref',
  nestedField: { level2: { level3: { level4: { value: 'some string' } } } },
}
const testObjectChecksum = '9d15391c6fea84d122e0b22f7b9eb90f'

describe('generateChecksumForBufferOrString', () => {
  it('returns the same checksum for a string and its bytes', () => {
    const value = 'some test string value'

    expect(generateChecksumForBufferOrString(value)).toBe('bfd5bbd64f6b83abe1d7d3b06221eb3a')
    expect(generateChecksumForBufferOrString(Buffer.from(value))).toBe(
      'bfd5bbd64f6b83abe1d7d3b06221eb3a',
    )
  })
})

describe('generateChecksumForObject', () => {
  it('returns the checksum of the JSON', () => {
    expect(generateChecksumForObject(testObject)).toBe(testObjectChecksum)
  })
})

describe('generateChecksumForReadable', () => {
  it('returns the checksum of a stream of strings', async () => {
    const json = JSON.stringify(testObject)
    const readable = Readable.from([json.slice(0, 10), json.slice(10)])

    await expect(generateChecksumForReadable(readable)).resolves.toBe(testObjectChecksum)
  })

  it('returns the checksum of a stream of buffers', async () => {
    const readable = Readable.from([Buffer.from([0, 1]), Buffer.from([2, 255])])

    await expect(generateChecksumForReadable(readable)).resolves.toBe(
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

    await expect(generateChecksumForReadable(readable)).rejects.toBe(error)
  })
})
