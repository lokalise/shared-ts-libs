import { describe, expect, it } from 'vitest'

import { ROOM_ID_SCHEMA, getRoomFromRoomId, getRoomId } from '../src/rooms'

const projectId = '0000000a-aa00-0aaa-a00a-00aaa0000001'
const userId = '0000000a-aa00-0aaa-a00a-00aaa0000002'

describe('Rooms', () => {
  it('should return room id', () => {
    const roomId = getRoomId('export', { projectId })
    expect(roomId).toBe(`export|{"projectId":"${projectId}"}`)
  })

  it('should return the same room id no matter the order of parameters', () => {
    const roomA = getRoomId('project-user', { projectId, userId })
    // The order of parameters is different here intentionally.
    const roomB = getRoomId('project-user', { userId, projectId })
    expect(roomA).toEqual(roomB)
  })

  it('should return room for room with projectId param', () => {
    const room = getRoomFromRoomId(`import|{"projectId":"${projectId}"}`)

    expect(room).toEqual({
      name: 'import',
      parameters: { projectId },
    })
  })

  it('should return room for project-user roomId', () => {
    const roomId = getRoomId('project-user', { projectId, userId })
    const room = getRoomFromRoomId(roomId)

    expect(room).toEqual({
      name: 'project-user',
      parameters: { projectId, userId },
    })
  })

  it('should successfully parse valid room id', () => {
    const parseResult = ROOM_ID_SCHEMA.safeParse(`import|{"projectId":"${projectId}"}`)
    expect(parseResult.success).toBe(true)
  })

  it('should return error for invalid room id', () => {
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    const parseResult = ROOM_ID_SCHEMA.safeParse(`invalid-room-id`)
    expect(parseResult.success).toBe(false)
  })
})
