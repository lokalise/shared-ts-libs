import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor } from '../src/cursorCodec'

describe('cursorCodec', () => {
	it('encode and decode works', () => {
		const value = {
			id: '1',
			name: 'apple',
			sub: { id: 1 },
			array1: ['1', '2'],
			array2: [{ name: 'hello' }, { name: 'world' }],
		}
		expect(decodeCursor(encodeCursor(value))).toEqual(value)
	})

	it('trying to decode not encoded text', () => {
		let error: Error | undefined
		try {
			decodeCursor('should fail')
		} catch (e) {
			error = e instanceof Error ? e : undefined
		}
		expect(error).toBeDefined()
		expect(error.message).toContain('is not valid JSON')
	})
})
