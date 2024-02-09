import { isFailure } from '@lokalise/node-core'
import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor } from '../src'

describe('cursorCodec', () => {
	it('encode and decode works', () => {
		const value = {
			id: '1',
			name: 'apple',
			sub: { id: 1 },
			array1: ['1', '2'],
			array2: [{ name: 'hello' }, { name: 'world' }],
		}
		expect(decodeCursor(encodeCursor(value))).toEqual({ result: value })
	})

	it('trying to decode not encoded text', () => {
		const result = decodeCursor('should fail')
		expect(isFailure(result)).toBe(true)
		expect((result.error as Error).message).toContain('is not valid JSON')
	})
})
