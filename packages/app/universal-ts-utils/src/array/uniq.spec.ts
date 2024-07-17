import { describe, expect, it } from 'vitest'
import { uniq } from './uniq'

describe('uniq', () => {
	it('returns a new array of mixed primitive value without duplicates', () => {
		const input = [1, 'a', 1, 'b', true, true, false]

		expect(uniq(input)).toEqual([1, 'a', 'b', true, false])
		expect(input).toEqual([1, 'a', 1, 'b', true, true, false])
	})
})
