import { ReservedRoomEvents } from './reservedRoomEvents'
import { ReservedSocketEvents } from './reservedSocketEvents'

export const ServerToClientEvents = {
  ...ReservedRoomEvents,
  ...ReservedSocketEvents,
}
