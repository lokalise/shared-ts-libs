import { z } from 'zod'

const Uuid = z.string().uuid()

const WORKSPACE_ID_SCHEMA = z.object({ workspaceId: Uuid })
const PROJECT_ID_SCHEMA = z.object({ projectId: Uuid })
const USER_ID_SCHEMA = z.object({ userId: Uuid })
const PROJECT_USER_ID_SCHEMA = z.object({
	projectId: Uuid,
	userId: Uuid,
})
const PROJECT_LANGUAGE_ID_SCHEMA = z.object({
	projectId: Uuid,
	languageId: Uuid.optional(),
})
const INTEGRATION_ID_SCHEMA = z.object({ integrationId: Uuid })

const RoomSchemas = {
	shopify: INTEGRATION_ID_SCHEMA,
	import: PROJECT_ID_SCHEMA, // to be removed
	git: PROJECT_ID_SCHEMA,
	upload: USER_ID_SCHEMA, // to be removed
	export: PROJECT_ID_SCHEMA,
	translation: PROJECT_ID_SCHEMA,
	segment: PROJECT_ID_SCHEMA,
	workspace: WORKSPACE_ID_SCHEMA,
	project: PROJECT_ID_SCHEMA,
	user: USER_ID_SCHEMA,
	'content-manager': PROJECT_LANGUAGE_ID_SCHEMA,
	// Unused room - this is an example how to use room with multiple parameters.
	'project-user': PROJECT_USER_ID_SCHEMA,
}

export type RoomName = keyof typeof RoomSchemas
export type RoomParameters<Rn extends RoomName> = z.infer<(typeof RoomSchemas)[Rn]>
export type Rooms = { [Rn in RoomName]: { name: Rn; parameters: RoomParameters<Rn> } }
export type Room<Rn extends RoomName> = Rooms[Rn]

/**
 * Room ID is an encoded room name with JSON encoded parameters.
 *
 * Example room ID: room-name|{"projectId":"0000000a-aa00-0aaa-a00a-00aaa0000001"}
 */
export type RoomId = `${RoomName}|${string}`

const SEPARATOR = '|'

export const getRoomId = <Rn extends RoomName>(
	roomName: Rn,
	parameters: RoomParameters<Rn>,
): RoomId => {
	const sortedParameters = JSON.stringify(parameters, Object.keys(parameters).sort())
	return `${roomName}${SEPARATOR}${sortedParameters}`
}

function isRoomName(roomName: unknown): roomName is RoomName {
	return typeof roomName === 'string' && roomName in RoomSchemas
}

export const getRoomFromRoomId = <Rn extends RoomName>(roomId: RoomId): Room<Rn> => {
	const [name, parameters] = roomId.split(SEPARATOR)

	if (!isRoomName(name) || typeof parameters !== 'string') {
		throw new Error(`Unknown roomId ${roomId}`)
	}

	return {
		name,
		parameters: RoomSchemas[name].parse(JSON.parse(parameters)),
	} as Room<Rn>
}

/**
 * Zod schema for RoomId.
 */
export const ROOM_ID_SCHEMA = z.custom<RoomId>((value) => {
	try {
		return !!getRoomFromRoomId(value as RoomId)
	} catch {
		return false
	}
})
