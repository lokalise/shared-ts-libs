# Websockets common package

This package contains core websocket system events and tools that can be used by backend and frontend services

## Getting started

### Server to Client events and vice-versa

Events are separated into two groups

1. Server to Client events (`server-to-client`)
2. Client to Server events (`client-to-server`)

The names are pretty self-explanatory, but the gist of it is - these dictate which events can be subscribed to and which events can be emitted. For example the Server can only subscribe to `client-to-server` events and can only emit `server-to-client` events.

### Event schemas

Event schema is a Zod object. The object will be passed as an argument for the event.

```typescript
const DEMO_EVENT_SCHEMA = z.object({
    first: z.string(),
    second: z.string(),
})
```

### Creating an event contract

An event contract is basically an object containing entries with a `schema`. Each `key` in that object represents the event name. Here is an example event definition.

```typescript
export const DemoEvents = {
	'users.demo.request': {
		schema: DEMO_EVENT_SCHEMA,
	},
}
```

You can split your definitions into multiple files/objects and combine them later.

```typescript
export const MyEvents = {
	...DemoEvents,
	...SomeOtherEvents,
}
```
