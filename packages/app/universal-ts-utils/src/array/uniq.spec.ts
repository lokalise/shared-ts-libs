import { describe, expect, it } from 'vitest'
import { uniq } from './uniq'

describe('uniq', () => {
	it('returns a new array of mixed primitive value without duplicates', () => {
		const objectA = {};
		const values = [1, 'a', Number.NaN, true, false, objectA, null, undefined];
		const duplicateValues =  [...values, ...values];

		expect(uniq(duplicateValues)).toEqual([1, 'a', Number.NaN, true, false, objectA, null, undefined])
	})
})
