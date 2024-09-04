import { ReservedRoomEvents } from './reservedRoomEvents'
import { ReservedSocketEvents } from './reservedSocketEvents'

export const ClientToServerEvents = {
  ...ReservedRoomEvents,
  ...ReservedSocketEvents,
}
