import { ClientToServerEvents } from './client-to-server'
import { ServerToClientEvents } from './server-to-client'

export const ReservedClientToServerEvents = {
	...ClientToServerEvents,
}
export const ReservedServerToClientEvents = {
	...ServerToClientEvents,
}
