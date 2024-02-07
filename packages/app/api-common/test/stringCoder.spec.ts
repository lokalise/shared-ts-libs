import { describe, expect, it } from 'vitest'

import { decode, encode } from '../src/stringCoder'

describe('stringCoder', () => {
	it('encode and decode works', () => {
		const value1 = 'test'
		expect(decode(encode(value1))).toBe(value1)

		const value2 = 'This.is_another-(more?@["complex"])case!'
		expect(decode(encode(value2))).toBe(value2)

		const value3 = JSON.stringify({
			id: '1',
			name: 'apple',
			sub: { id: 1 },
			array1: ['1', '2'],
			array2: [{ name: 'hello' }, { name: 'world' }],
		})
		expect(decode(encode(value3))).toBe(value3)
	})
})
