import { generateMonotonicUuid, generateUuid7 } from './index'

const abstractUuidRegex =
	/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i

describe('idUtils', () => {
	describe('generateMonotonicUuid', () => {
		it('generates a UUID-like string', () => {
			const id = generateMonotonicUuid()

			expect(id).toMatch(abstractUuidRegex)
		})

		it('generates sortable ID', () => {
			const ids = []

			for (const _i of Array(10)) {
				ids.push(generateMonotonicUuid())
			}

			const sortedIds = [...ids].sort()

			expect(sortedIds).toMatchObject(ids)
		})
	})

	describe('generateUuid7', () => {
		it('generates a UUID-like string', () => {
			const id = generateUuid7()

			expect(id).toMatch(abstractUuidRegex)
		})
	})
})
