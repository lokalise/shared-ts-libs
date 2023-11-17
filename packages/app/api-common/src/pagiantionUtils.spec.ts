import { getMetaFor } from './paginationUtils'

describe('getMetaFor', () => {
	it('cursor is defined', () => {
		const mockedArray = [{ id: 'a' }, { id: 'b' }]
		getMetaFor(mockedArray)

		expect(getMetaFor(mockedArray)).toEqual({ count: 2, cursor: 'b' })
	})

	it('cursor is undefined', () => {
		const mockedArray: Entity[] = []
		getMetaFor(mockedArray)

		expect(getMetaFor(mockedArray)).toEqual({ count: 0 })
	})
})

type Entity = {
	id: string
}
