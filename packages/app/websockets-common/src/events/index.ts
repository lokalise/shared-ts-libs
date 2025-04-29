import { ClientToServerEvents } from './client-to-server/index.ts'
import { ServerToClientEvents } from './server-to-client/index.ts'

export const ReservedClientToServerEvents = {
  ...ClientToServerEvents,
}
export const ReservedServerToClientEvents = {
  ...ServerToClientEvents,
}
