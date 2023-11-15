import { ULIDtoUUID } from 'ulid-uuid-converter'
import { monotonicFactory } from 'ulidx'

const ulid = monotonicFactory()

/**
 * Generates a UUID-like string using the ULID generation algorithm.
 * This string is guaranteed to be lexicographically sortable and monotonic.
 *
 * Caveat: in the case of distributed systems, the sort order of such IDs
 * generated within a millisecond can not be guaranteed.
 */
export function generateMonotonicUuid(): string {
	const id = ulid()

	return ULIDtoUUID(id)
}
