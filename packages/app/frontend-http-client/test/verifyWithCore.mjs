/**
 * Acceptance gate: this package's `createFallbackTransport` driving the real
 * `@opinionated-machine/sse-fallback` client core against a real HTTP server.
 *
 * The unit suite covers the adapter in isolation; this covers the seam — that
 * the core actually gets what it needs out of it. It lives outside `vitest`
 * because the core is an optional peer nobody has to install:
 *
 *   pnpm add -D @opinionated-machine/sse-fallback
 *   pnpm run build && node test/verifyWithCore.mjs
 *
 * Run it when bumping the core, or when changing anything in `src/sse-fallback`.
 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { defineApiContract, sseResponse } from '@lokalise/api-contracts'
import { getLocal } from 'mockttp'
import wretch from 'wretch'
import { z } from 'zod/v4'
import { buildFallbackParams, createFallbackTransport } from '../dist/index.js'

const CORE_PACKAGE = '@opinionated-machine/sse-fallback'

let core
try {
  core = await import(CORE_PACKAGE)
} catch {
  process.stderr.write(
    `${CORE_PACKAGE} is not installed, so there is no client core to verify against.\n` +
      `Install it first:  pnpm add -D ${CORE_PACKAGE}\n`,
  )
  process.exit(1)
}
const { createResilientSubscription, defineFallbackBinding } = core

const snapshotSchema = z.object({
  version: z.number(),
  status: z.enum(['pending', 'completed']),
})

const contract = defineApiContract({
  visibility: 'public',
  summary: 'Upload status',
  method: 'get',
  pathResolver: (params) => `/uploads/${params.uploadId}/status`,
  requestPathParamsSchema: z.object({ uploadId: z.string() }),
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': snapshotSchema,
        ...sseResponse({
          uploadFinished: z.object({ version: z.number(), result: z.string() }),
          progress: z.object({ version: z.number(), percent: z.number() }),
        }).content,
      },
    },
  },
})

const binding = defineFallbackBinding(contract, {
  snapshotToEvents: (snapshot) =>
    snapshot.status === 'completed'
      ? [{ event: 'uploadFinished', data: { version: snapshot.version, result: 'from-poll' } }]
      : [],
  version: { ofSnapshot: (snapshot) => snapshot.version },
  terminalEvents: ['uploadFinished'],
})

const server = getLocal()
await server.start()

const results = []

// ---------------------------------------------------------------------------
// 1. The happy path over SSE: the event travels over the stream.
// ---------------------------------------------------------------------------
{
  const upstream = new Readable({ read() {} })
  await server
    .forGet('/uploads/u-1/status')
    .matching((request) => request.headers.accept === 'text/event-stream')
    .thenStream(200, upstream, { 'content-type': 'text/event-stream' })
  await server.forGet('/uploads/u-1/status').thenJson(200, { version: 1, status: 'pending' })

  const transport = createFallbackTransport(wretch(server.url), { contract })
  const subscription = createResilientSubscription(binding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-1' } }),
  })

  upstream.push(': heartbeat\n\n')
  upstream.push(
    `id: 7\nevent: uploadFinished\ndata: ${JSON.stringify({ version: 7, result: 'over-sse' })}\n\n`,
  )

  const finished = await subscription.waitFor('uploadFinished', { timeoutMs: 5_000 })
  assert.deepEqual(finished, { version: 7, result: 'over-sse' })
  assert.equal(subscription.result?.reason, 'terminal-event')
  upstream.push(null)
  results.push('SSE delivery + subscribe-first hydration')
  server.reset()
}

// ---------------------------------------------------------------------------
// 2. The whole point: SSE never delivers, the poll repairs it.
// ---------------------------------------------------------------------------
{
  const upstream = new Readable({ read() {} })
  await server
    .forGet('/uploads/u-2/status')
    .matching((request) => request.headers.accept === 'text/event-stream')
    .thenStream(200, upstream, { 'content-type': 'text/event-stream' })

  let polls = 0
  await server.forGet('/uploads/u-2/status').thenCallback(() => {
    polls += 1
    return {
      statusCode: 200,
      json: polls === 1 ? { version: 1, status: 'pending' } : { version: 2, status: 'completed' },
    }
  })

  const transport = createFallbackTransport(wretch(server.url), { contract })
  const subscription = createResilientSubscription(binding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-2' } }),
    // A live stream that never delivers the event: only the deadman poll saves it.
    policy: { deadmanDelayMs: 200 },
  })

  // Keep the connection demonstrably alive so nothing but the deadman fires.
  const heartbeat = setInterval(() => upstream.push(': heartbeat\n\n'), 50)
  const finished = await subscription.waitFor('uploadFinished', { timeoutMs: 5_000 })
  clearInterval(heartbeat)
  assert.deepEqual(finished, { version: 2, result: 'from-poll' })
  assert.ok(polls >= 2, `expected a reconciliation poll, saw ${polls}`)
  upstream.push(null)
  results.push('deadman poll repairs an event the live stream never sent')
  server.reset()
}

// ---------------------------------------------------------------------------
// 3. Last-Event-ID is forwarded on reconnect after the stream drops.
// ---------------------------------------------------------------------------
{
  const first = new Readable({ read() {} })
  const second = new Readable({ read() {} })
  const isSse = (request) => request.headers.accept === 'text/event-stream'

  const firstConnect = await server
    .forGet('/uploads/u-3/status')
    .matching(isSse)
    .once()
    .thenStream(200, first, { 'content-type': 'text/event-stream' })
  const secondConnect = await server
    .forGet('/uploads/u-3/status')
    .matching(isSse)
    .thenStream(200, second, { 'content-type': 'text/event-stream' })
  await server.forGet('/uploads/u-3/status').thenJson(200, { version: 1, status: 'pending' })

  const transport = createFallbackTransport(wretch(server.url), { contract })
  const subscription = createResilientSubscription(binding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-3' } }),
    policy: { sseRetryBackoff: { baseMs: 20, factor: 1, maxMs: 20 } },
  })

  first.push(`id: 11\nevent: progress\ndata: ${JSON.stringify({ version: 11, percent: 10 })}\n\n`)
  setTimeout(() => first.push(null), 150)
  second.push(
    `id: 12\nevent: uploadFinished\ndata: ${JSON.stringify({ version: 12, result: 'after-reconnect' })}\n\n`,
  )

  const finished = await subscription.waitFor('uploadFinished', { timeoutMs: 8_000 })
  assert.deepEqual(finished, { version: 12, result: 'after-reconnect' })

  const [firstRequest] = await firstConnect.getSeenRequests()
  const [secondRequest] = await secondConnect.getSeenRequests()
  assert.equal(firstRequest.headers['last-event-id'], undefined, 'first connect carries no cursor')
  assert.equal(
    secondRequest.headers['last-event-id'],
    '11',
    `reconnect must resume from id 11, got ${secondRequest.headers['last-event-id']}`,
  )
  second.push(null)
  results.push('Last-Event-ID resumes the stream after a drop')
  server.reset()
}

// ---------------------------------------------------------------------------
// 4. A refused stream reaches onAuthChallenge, and the retry sees a new token.
// ---------------------------------------------------------------------------
{
  let token = 'expired'
  const upstream = new Readable({ read() {} })
  const isSse = (request) => request.headers.accept === 'text/event-stream'

  const refusal = await server
    .forGet('/uploads/u-4/status')
    .matching(isSse)
    .once()
    .thenJson(401, { message: 'expired' })
  const accepted = await server
    .forGet('/uploads/u-4/status')
    .matching(isSse)
    .thenStream(200, upstream, { 'content-type': 'text/event-stream' })
  await server.forGet('/uploads/u-4/status').thenJson(200, { version: 1, status: 'pending' })

  const transport = createFallbackTransport(wretch(server.url), {
    contract,
    headers: () => ({ authorization: `Bearer ${token}` }),
  })

  let refreshes = 0
  const subscription = createResilientSubscription(binding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-4' } }),
    policy: { sseRetryBackoff: { baseMs: 20, factor: 1, maxMs: 20 } },
    onAuthChallenge: () => {
      refreshes += 1
      token = 'refreshed'
      return true
    },
  })

  upstream.push(
    `id: 20\nevent: uploadFinished\ndata: ${JSON.stringify({ version: 20, result: 'authorized' })}\n\n`,
  )
  const finished = await subscription.waitFor('uploadFinished', { timeoutMs: 8_000 })
  assert.deepEqual(finished, { version: 20, result: 'authorized' })
  assert.equal(refreshes, 1)

  const [refusedRequest] = await refusal.getSeenRequests()
  const [acceptedRequest] = await accepted.getSeenRequests()
  assert.equal(refusedRequest.headers.authorization, 'Bearer expired')
  assert.equal(
    acceptedRequest.headers.authorization,
    'Bearer refreshed',
    `retry must carry the new token, got ${acceptedRequest.headers.authorization}`,
  )
  upstream.push(null)
  results.push('onAuthChallenge recovery picks up a freshly resolved token')
  server.reset()
}

// ---------------------------------------------------------------------------
// 5. poll-only adoption: no stream endpoint at all.
// ---------------------------------------------------------------------------
{
  let polls = 0
  const endpoint = await server.forGet('/uploads/u-5/status').thenCallback(() => {
    polls += 1
    return {
      statusCode: 200,
      json: polls < 2 ? { version: 1, status: 'pending' } : { version: 5, status: 'completed' },
    }
  })

  const transport = createFallbackTransport(wretch(server.url), { contract })
  const subscription = createResilientSubscription(binding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-5' } }),
    policy: { mode: 'poll-only', degradedPollIntervalMs: 100 },
  })

  const finished = await subscription.waitFor('uploadFinished', { timeoutMs: 5_000 })
  assert.deepEqual(finished, { version: 5, result: 'from-poll' })
  const seen = await endpoint.getSeenRequests()
  assert.ok(seen.length > 0)
  assert.ok(
    seen.every((request) => request.headers.accept === 'application/json'),
    'poll-only must never open a stream',
  )
  results.push('poll-only mode never opens a stream')
  server.reset()
}

// ---------------------------------------------------------------------------
// 6. A snapshot that violates the contract is a poll failure, not a poisoned
//    watermark: the next valid snapshot still delivers.
// ---------------------------------------------------------------------------
{
  let polls = 0
  const pollErrors = []
  await server.forGet('/uploads/u-6/status').thenCallback(() => {
    polls += 1
    return {
      statusCode: 200,
      json: polls === 1 ? { version: 'nine' } : { version: 9, status: 'completed' },
    }
  })

  const transport = createFallbackTransport(wretch(server.url), { contract })
  const subscription = createResilientSubscription(binding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-6' } }),
    policy: {
      mode: 'poll-only',
      degradedPollIntervalMs: 50,
      pollFailureBackoff: { baseMs: 20, factor: 1, maxMs: 20 },
    },
    diagnostics: { onPollError: (error) => pollErrors.push(error) },
  })

  const finished = await subscription.waitFor('uploadFinished', { timeoutMs: 5_000 })
  assert.deepEqual(finished, { version: 9, result: 'from-poll' })
  assert.equal(pollErrors.length >= 1, true)
  assert.equal(pollErrors[0].name, 'FallbackSnapshotValidationError')
  results.push('a schema-invalid snapshot is a retried poll failure, reported to diagnostics')
  server.reset()
}

// ---------------------------------------------------------------------------
// 7. Reduced state via the `events` stream mode, with a dropped bad payload.
// ---------------------------------------------------------------------------
{
  const stateBinding = defineFallbackBinding(contract, {
    snapshotEvent: 'progress',
    version: { ofSnapshot: (snapshot) => snapshot.version, ofEvent: (event) => event.data.version },
    state: { init: (snapshot) => snapshot, apply: (state, event) => ({ ...state, ...event.data }) },
  })

  const upstream = new Readable({ read() {} })
  await server
    .forGet('/uploads/u-7/status')
    .matching((request) => request.headers.accept === 'text/event-stream')
    .thenStream(200, upstream, { 'content-type': 'text/event-stream' })
  await server.forGet('/uploads/u-7/status').thenJson(200, { version: 1, status: 'pending' })

  const schemaErrors = []
  const transport = createFallbackTransport(wretch(server.url), {
    contract,
    streamMode: 'events',
    eventValidation: 'drop',
    diagnostics: { onEventSchemaError: (error) => schemaErrors.push(error) },
  })
  const subscription = createResilientSubscription(stateBinding, {
    transport,
    params: buildFallbackParams(contract, { pathParams: { uploadId: 'u-7' } }),
    policy: { deadmanDelayMs: 60_000 },
  })

  await new Promise((resolve) => setTimeout(resolve, 300))
  upstream.push('id: 2\nevent: progress\ndata: {"version":2,"percent":"half"}\n\n')
  upstream.push(`id: 3\nevent: progress\ndata: ${JSON.stringify({ version: 3, percent: 75 })}\n\n`)

  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(schemaErrors.length, 1, `expected one schema error, saw ${schemaErrors.length}`)
  assert.equal(schemaErrors[0].event, 'progress')
  assert.equal(subscription.getState()?.percent, 75, 'the valid delta must have been applied')
  subscription.stop()
  upstream.push(null)
  results.push("streamMode 'events' + eventValidation 'drop' withholds a bad payload")
  server.reset()
}

await server.stop()
process.stdout.write(`\nVerified against the real ${CORE_PACKAGE} core:\n`)
for (const result of results) process.stdout.write(`  ✓ ${result}\n`)
