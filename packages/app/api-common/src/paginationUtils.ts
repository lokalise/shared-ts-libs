export function getMetaFor<T extends { id: string }>(data: T[]) {
	return {
		count: data.length,
		cursor: data.length > 0 ? data[data.length - 1].id : undefined,
	}
}
