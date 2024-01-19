import type { z, ZodObject } from 'zod'

import type { ReservedClientToServerEvents, ReservedServerToClientEvents } from '../events'

export interface WebsocketEvent {
	// We do not care about specific type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	schema: ZodObject<any>
}

export type WebsocketEventMap = Record<string, WebsocketEvent>

export type ReservedServerToClientWebsocketEventMap = typeof ReservedServerToClientEvents
export type ReservedClientToServerWebsocketEventMap = typeof ReservedClientToServerEvents

export interface ServerToClientWebsocketEventMap
	extends WebsocketEventMap,
		ReservedServerToClientWebsocketEventMap {}

export interface ClientToServerWebsocketEventMap
	extends WebsocketEventMap,
		ReservedClientToServerWebsocketEventMap {}

export type WebsocketEventName<WEM extends WebsocketEventMap> = keyof WEM

export type WebsocketEventSchema<
	WEM extends WebsocketEventMap,
	WEN extends WebsocketEventName<WEM>,
> = z.infer<WEM[WEN]['schema']>

type IsEmpty<T> = {
	[P in keyof T]: false
} extends {
	[key: string]: true
}
	? true
	: false

/**
 * Socket.IO expects types to be defined as a Record with eventName:callbackFn.
 * See https://socket.io/docs/v4/typescript for examples.
 *
 * This generics converts our Zod schemas to compatible Socket.IO format.
 */
export type SocketIoEventMap<EventMap extends WebsocketEventMap> = {
	// if the schema is an empty object, we forbid passing args whatsoever, because otherwise an object with arbitrary keys would be allowed
	[EventName in WebsocketEventName<EventMap>]: IsEmpty<
		WebsocketEventSchema<EventMap, EventName>
	> extends true
		? () => void
		: (args: WebsocketEventSchema<EventMap, EventName>) => void
}

export type SocketIoEventHandler<
	WEM extends WebsocketEventMap,
	WEN extends WebsocketEventName<WEM>,
> = SocketIoEventMap<WEM>[WEN]

export type WebsocketEventAndRoomConfig<
	STCEM extends WebsocketEventMap,
	CTSEM extends WebsocketEventMap,
> = {
	serverToClientWebsocketEvents: STCEM
	clientToServerWebsocketEvents: CTSEM
}
