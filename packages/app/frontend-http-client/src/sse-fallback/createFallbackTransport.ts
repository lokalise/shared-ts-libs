import type { ApiContract, ResponseKind, SseSchemaByEventName } from '@lokalise/api-contracts'
import {
  buildRequestPath,
  getSseSchemaByEventName,
  resolveResponseEntry,
} from '@lokalise/api-contracts'
import { stringify } from 'fast-querystring'
import { WretchError } from 'wretch/resolver'
import type { HeadersObject, HeadersSource, WretchInstance } from '../types.ts'
import { normalizeResponseHeaders } from '../utils/responseUtils.ts'
import {
  FallbackEventValidationError,
  FallbackSnapshotValidationError,
  FallbackTransportError,
  FallbackUnexpectedSnapshotError,
} from './errors.ts'
import { SseFramer } from './framer.ts'
import type {
  FallbackChannel,
  FallbackParsedSseFrame,
  FallbackSnapshotResponse,
  FallbackStreamResponse,
  FallbackTransport,
  FallbackTransportRequest,
} from './types.ts'

const SSE_ACCEPT = 'text/event-stream'
const DEFAULT_SNAPSHOT_ACCEPT = 'application/json'
const BODY_PREVIEW_LIMIT = 200
const SUPPORTED_METHODS = ['get', 'delete', 'post', 'put', 'patch'] as const

type SupportedMethod = (typeof SUPPORTED_METHODS)[number]

/** How SSE payloads that do not match the contract's event schemas are handled. */
export type FallbackEventValidationMode =
  /** Deliver every frame unchecked. */
  | 'off'
  /**
   * Validate and report to `diagnostics.onEventSchemaError`, but deliver the
   * frame anyway. The default, and the only sound choice with
   * `streamMode: 'chunks'`: by the time app code sees a frame the core's
   * version gate has already advanced its watermark, so withholding it there
   * would leave a hole that the repair poll reads as a duplicate and drops.
   */
  | 'report'
  /**
   * Withhold the frame from the core entirely, so the version watermark never
   * advances past it and the deadman poll repairs the gap from a snapshot.
   * Requires `streamMode: 'events'`, which is where the framing — and
   * therefore the decision — happens before the core sees anything.
   */
  | 'drop'

/** Which {@link FallbackStreamResponse} shape `openStream` resolves with. */
export type FallbackStreamMode =
  /**
   * Raw decoded text, framed by the core (default). Heartbeat comments reach
   * the core, so its `staleConnectionTimeoutMs` watchdog is byte-level, and
   * every frame keeps its own `id:` for the version gate.
   */
  | 'chunks'
  /**
   * Frames, framed here. Comment frames are consumed by the framing, so the
   * stale-connection watchdog degrades from byte-level to event-level — the
   * price of validating payloads before the core sees them.
   */
  | 'events'

export type FallbackTransportDiagnostics = {
  /** Every snapshot poll that produced a response, including non-2xx ones. */
  onSnapshot?: (info: { path: string; status: number; durationMs: number }) => void
  /** Every stream connect attempt that produced response headers. */
  onStreamOpen?: (info: {
    path: string
    status: number
    contentType: string | undefined
    lastEventId: string | undefined
  }) => void
  /**
   * An SSE payload did not match the contract. Silent schema drift is how a
   * push channel stops working without anyone noticing, so this is the hook to
   * wire to your error reporter.
   */
  onEventSchemaError?: (error: FallbackEventValidationError) => void
  /**
   * The stream sent an event the contract does not declare. Never dropped —
   * an unknown event is usually a newer server, not a broken one — but worth
   * counting: it means the contract and the emitter have diverged.
   */
  onUndeclaredEvent?: (info: { path: string; event: string }) => void
}

export type CreateFallbackTransportOptions = {
  /**
   * The dual-mode contract both channels use — one path serving JSON via
   * `Accept: application/json` and SSE via `Accept: text/event-stream`.
   *
   * Supplying it is what turns on validation: snapshots are parsed with the
   * contract's JSON schema for the responding status, and SSE payloads are
   * checked against its `sseResponse` event schemas. Without a contract the
   * transport still works, but bodies pass through unvalidated.
   */
  contract?: ApiContract
  /** Poll contract, when the poll and the stream live on separate contracts. */
  snapshotContract?: ApiContract
  /** Stream contract, when the poll and the stream live on separate contracts. */
  streamContract?: ApiContract
  /** Prefix prepended to both channels' paths, as in `sendByApiContract`. */
  pathPrefix?: string
  /**
   * Headers added to every request. Resolved **fresh for each poll and each
   * reconnect**, so a function here is how a rotating credential reaches the
   * retry that `onAuthChallenge` grants: refresh the token in the challenge
   * handler, and the retried request picks it up.
   */
  headers?: HeadersSource
  /**
   * `Accept` sent on the poll. Defaults to `application/json`; override only
   * for a vendored JSON media type (`application/json+01`) that the contract
   * declares. The stream's `Accept` is always `text/event-stream` — the branch
   * selection belongs to the transport, so any `accept` in the request headers
   * is overridden on both channels.
   */
  snapshotAccept?: string
  /**
   * Validate snapshot bodies against the contract schema. Default `true`.
   * Turning it off keeps the response shape unchecked, which puts the burden
   * of a wrong `version.ofSnapshot` back on runtime behaviour — prefer fixing
   * the schema.
   */
  validateSnapshot?: boolean
  /**
   * Require the snapshot's `content-type` to match a representation the
   * contract declares (default `true`). Mirrors `sendByApiContract`.
   */
  strictContentType?: boolean
  /** See {@link FallbackStreamMode}. Default `'chunks'`. */
  streamMode?: FallbackStreamMode
  /**
   * See {@link FallbackEventValidationMode}. Defaults to `'report'` when the
   * stream contract declares SSE event schemas, `'off'` otherwise.
   */
  eventValidation?: FallbackEventValidationMode
  diagnostics?: FallbackTransportDiagnostics
}

type PreparedRequest = {
  method: SupportedMethod
  /** Path including the prefix, without the query string — for error messages. */
  path: string
  url: string
  headers: Record<string, string>
  bodyString: string | undefined
}

type ExecuteOutcome =
  | { ok: true; response: Response }
  | { ok: false; status: number; headers: Record<string, string>; body: unknown }

function previewOf(text: string): string {
  return text.length > BODY_PREVIEW_LIMIT ? `${text.slice(0, BODY_PREVIEW_LIMIT)}…` : text
}

function isSupportedMethod(method: string): method is SupportedMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(method)
}

function resolveHeaderSource(source: HeadersSource): HeadersObject | Promise<HeadersObject> {
  return typeof source === 'function' ? source() : source
}

function describeCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read what a failed request carried, from the {@link WretchError} wretch
 * throws for any non-2xx response. `errorType` decides whether the body landed
 * in `json` or `text`; either way the body has already been consumed, which is
 * what releases the connection.
 */
function fromWretchError(error: WretchError): ExecuteOutcome {
  return {
    ok: false,
    status: error.status,
    /* v8 ignore next -- wretch always attaches the response it refused */
    headers: error.response ? normalizeResponseHeaders(error.response) : {},
    body: error.json !== undefined ? error.json : error.text,
  }
}

async function* emptyChunks(): AsyncGenerator<string> {
  // A refused connect carries no stream; the core counts it as a connect
  // failure the moment it sees the status.
}

/**
 * Decode a response body into text chunks.
 *
 * Deliberately a manual reader loop rather than `pipeThrough(new
 * TextDecoderStream())` plus async iteration: `ReadableStream` async iteration
 * is still missing in shipping Safari, and this is the one code path in the
 * package that a long-lived stream depends on.
 */
async function* readTextChunks(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      const text = decoder.decode(value, { stream: true })
      // A chunk that split a multi-byte character decodes to nothing until its
      // continuation arrives.
      if (text !== '') yield text
    }
  } catch (error) {
    // The core aborts the stream on purpose: to force a reconnect when the
    // stale-connection watchdog fires, and to release the socket when the
    // subscription stops. Neither is a stream error worth reporting.
    if (signal.aborted) return
    throw error
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Already closed or errored — the connection is released either way.
    }
  }
}

type ResolvedOptions = {
  snapshotContract: ApiContract | undefined
  pathPrefix: string | undefined
  headers: HeadersSource | undefined
  snapshotAccept: string
  validateSnapshot: boolean
  strictContentType: boolean
  streamMode: FallbackStreamMode
  eventValidation: FallbackEventValidationMode
  /** `null` when there is nothing to validate against, or validation is off. */
  eventSchemas: SseSchemaByEventName | null
  diagnostics: FallbackTransportDiagnostics
}

function assertConsistentOptions(
  options: CreateFallbackTransportOptions,
  resolved: { streamMode: FallbackStreamMode; eventValidation: FallbackEventValidationMode },
  declaredEventSchemas: SseSchemaByEventName | null,
): void {
  if (resolved.eventValidation === 'drop' && resolved.streamMode !== 'events') {
    throw new Error(
      "createFallbackTransport: eventValidation 'drop' requires streamMode 'events'. " +
        "With raw chunks the core frames the stream itself, so a frame cannot be withheld before its version is gated — dropping it there would leave a hole the repair poll reads as a duplicate. Use 'report' to keep byte-level liveness, or switch to streamMode 'events'.",
    )
  }
  if (options.eventValidation === undefined || resolved.eventValidation === 'off') return
  if (declaredEventSchemas) return

  const streamContract = options.streamContract ?? options.contract
  throw new Error(
    `createFallbackTransport: eventValidation '${resolved.eventValidation}' was requested, but ${
      streamContract
        ? `contract "${streamContract.summary}" declares no SSE event schemas (add an sseResponse to a success status)`
        : 'no contract was supplied to validate against (pass `contract` or `streamContract`)'
    }.`,
  )
}

function resolveOptions(options: CreateFallbackTransportOptions): ResolvedOptions {
  const streamContract = options.streamContract ?? options.contract
  const declaredEventSchemas = streamContract ? getSseSchemaByEventName(streamContract) : null
  const streamMode = options.streamMode ?? 'chunks'
  const eventValidation = options.eventValidation ?? (declaredEventSchemas ? 'report' : 'off')

  assertConsistentOptions(options, { streamMode, eventValidation }, declaredEventSchemas)

  return {
    snapshotContract: options.snapshotContract ?? options.contract,
    pathPrefix: options.pathPrefix,
    headers: options.headers,
    snapshotAccept: options.snapshotAccept ?? DEFAULT_SNAPSHOT_ACCEPT,
    validateSnapshot: options.validateSnapshot ?? true,
    strictContentType: options.strictContentType ?? true,
    streamMode,
    eventValidation,
    eventSchemas: eventValidation === 'off' ? null : declaredEventSchemas,
    diagnostics: options.diagnostics ?? {},
  }
}

/**
 * Merge the header layers, in the order that keeps the transport in charge of
 * channel selection: the shared source first (resolved now, so a refreshed
 * token is picked up), then the subscription's own headers, then the channel's
 * own `Accept` / `Cache-Control` / `Last-Event-ID`.
 */
async function buildRequestHeaders(
  config: ResolvedOptions,
  request: FallbackTransportRequest,
  channelHeaders: Record<string, string>,
  bodyString: string | undefined,
): Promise<Record<string, string>> {
  const headers = new Headers(
    config.headers ? await resolveHeaderSource(config.headers) : undefined,
  )
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers.set(name, value)
  }
  for (const [name, value] of Object.entries(channelHeaders)) {
    headers.set(name, value)
  }
  if (bodyString !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return Object.fromEntries(headers)
}

async function prepareRequest(
  config: ResolvedOptions,
  request: FallbackTransportRequest,
  channel: FallbackChannel,
  channelHeaders: Record<string, string>,
): Promise<PreparedRequest> {
  const path = buildRequestPath(request.path, config.pathPrefix)
  const method = request.method.toLowerCase()
  if (!isSupportedMethod(method)) {
    throw new FallbackTransportError(
      `Cannot open the ${channel} channel: "${request.method}" is not a supported HTTP method (${SUPPORTED_METHODS.join(', ')}).`,
      { channel, path },
    )
  }

  // GET/DELETE contracts carry no body, matching `sendByApiContract`.
  const carriesBody = method !== 'get' && method !== 'delete' && request.body !== undefined
  const bodyString = carriesBody ? JSON.stringify(request.body) : undefined
  const queryString = request.query ? stringify(request.query) : ''

  return {
    method,
    path,
    url: queryString ? `${path}?${queryString}` : path,
    headers: await buildRequestHeaders(config, request, channelHeaders, bodyString),
    bodyString,
  }
}

/**
 * Build a {@link FallbackTransport} over a `wretch` instance: the HTTP half of
 * `@opinionated-machine/sse-fallback`, which owns no HTTP of its own.
 *
 * `fetchSnapshot` requests the contract's JSON branch and validates the body;
 * `openStream` requests its SSE branch, forwards `Last-Event-ID` on reconnect,
 * and yields raw text chunks so the core's byte-level liveness watchdog works.
 *
 * Both channels follow the contract the core relies on: a non-2xx response
 * **resolves** (carrying the status, so `unretryableStatuses` and
 * `onAuthChallenge` can act on it) and only a genuinely unusable outcome
 * rejects — a network failure, or a snapshot that cannot be trusted. Neither
 * channel imposes its own deadline: the core bounds every wait
 * (`pollTimeoutMs`, `connectTimeoutMs`) through the `signal` it passes, and an
 * unbounded wait is exactly the silent failure this machinery exists to catch.
 *
 * @example
 * ```typescript
 * import { createResilientSubscription, defineFallbackBinding } from '@opinionated-machine/sse-fallback'
 * import { buildFallbackParams, createFallbackTransport } from '@lokalise/frontend-http-client'
 *
 * const binding = defineFallbackBinding(uploadStatusContract, {
 *   snapshotToEvents: (snapshot) =>
 *     snapshot.status === 'completed' ? [{ event: 'uploadFinished', data: snapshot }] : [],
 *   version: { ofSnapshot: (snapshot) => snapshot.version },
 *   terminalEvents: ['uploadFinished'],
 * })
 *
 * const transport = createFallbackTransport(client, {
 *   contract: uploadStatusContract,
 *   headers: () => ({ authorization: `Bearer ${auth.token()}` }),
 *   diagnostics: { onEventSchemaError: (error) => reportToBugsnag(error) },
 * })
 *
 * const subscription = createResilientSubscription(binding, {
 *   transport,
 *   params: buildFallbackParams(uploadStatusContract, { pathParams: { uploadId } }),
 *   onAuthChallenge: async () => {
 *     await auth.refresh()
 *     return true
 *   },
 * })
 *
 * const finished = await subscription.waitFor('uploadFinished')
 * ```
 */
export function createFallbackTransport(
  wretch: WretchInstance,
  options: CreateFallbackTransportOptions = {},
): FallbackTransport {
  const config = resolveOptions(options)
  const {
    snapshotContract,
    snapshotAccept,
    validateSnapshot,
    strictContentType,
    streamMode,
    eventValidation,
    eventSchemas,
    diagnostics,
  } = config

  const prepare = (
    request: FallbackTransportRequest,
    channel: FallbackChannel,
    channelHeaders: Record<string, string>,
  ): Promise<PreparedRequest> => prepareRequest(config, request, channel, channelHeaders)

  async function execute(
    prepared: PreparedRequest,
    signal: AbortSignal,
    channel: FallbackChannel,
  ): Promise<ExecuteOutcome> {
    const instance = wretch.url(prepared.url).headers(prepared.headers).options({ signal })
    try {
      const response =
        prepared.method === 'get' || prepared.method === 'delete'
          ? await instance[prepared.method]().res()
          : await instance[prepared.method](prepared.bodyString).res()
      return { ok: true, response }
    } catch (error) {
      // A refused status is a result, not a failure: the core needs to see it
      // to honour `unretryableStatuses` and offer it to `onAuthChallenge`.
      if (error instanceof WretchError) return fromWretchError(error)
      throw new FallbackTransportError(
        `The ${channel} request to "${prepared.path}" failed: ${describeCause(error)}`,
        { channel, path: prepared.path, cause: error },
      )
    }
  }

  function rejectUnusableSnapshot(entry: ResponseKind, path: string, status: number): void {
    if (entry.kind === 'sse') {
      throw new FallbackUnexpectedSnapshotError(
        `The poll of "${path}" was answered with an SSE stream instead of a snapshot. The Accept negotiation reached the wrong branch — check that the route (and any gateway in front of it) serves JSON for "Accept: ${snapshotAccept}".`,
        { channel: 'poll', path, status, contentType: SSE_ACCEPT },
      )
    }
    if (entry.kind === 'blob') {
      throw new FallbackUnexpectedSnapshotError(
        `The poll of "${path}" resolved to a binary response, which cannot be a snapshot: the fallback version gate needs a JSON body carrying a version.`,
        { channel: 'poll', path, status },
      )
    }
    if (entry.kind === 'noContent') {
      throw new FallbackUnexpectedSnapshotError(
        `The poll of "${path}" returned status ${status} with no body. A snapshot must carry state and a version — a bodyless response cannot advance the watermark, and treating it as an empty snapshot would report the resource as newly empty.`,
        { channel: 'poll', path, status },
      )
    }
  }

  async function readSnapshotJson(
    response: Response,
    path: string,
    contentType: string | undefined,
  ): Promise<unknown> {
    const text = await response.text()
    if (text === '') {
      throw new FallbackUnexpectedSnapshotError(
        `The poll of "${path}" returned an empty body where a JSON snapshot was expected.`,
        { channel: 'poll', path, status: response.status, contentType },
      )
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new FallbackUnexpectedSnapshotError(
        `The poll of "${path}" returned a body that is not valid JSON: ${describeCause(error)}`,
        {
          channel: 'poll',
          path,
          status: response.status,
          contentType,
          bodyPreview: previewOf(text),
          cause: error,
        },
      )
    }
  }

  async function readSnapshotBody(
    response: Response,
    path: string,
    contentType: string | undefined,
  ): Promise<unknown> {
    if (!snapshotContract) return await readSnapshotJson(response, path, contentType)

    const entry = resolveResponseEntry(
      snapshotContract.responsesByStatusCode,
      response.status,
      contentType,
      strictContentType,
    )
    if (!entry) {
      throw new FallbackUnexpectedSnapshotError(
        `The poll of "${path}" returned status ${response.status} with content-type "${contentType ?? '<none>'}", which "${snapshotContract.summary}" does not declare for that status.`,
        { channel: 'poll', path, status: response.status, contentType },
      )
    }
    rejectUnusableSnapshot(entry, path, response.status)

    const json = await readSnapshotJson(response, path, contentType)
    // Only the JSON representation survives `rejectUnusableSnapshot`.
    if (entry.kind !== 'json' || !validateSnapshot) return json

    const result = entry.schema.safeParse(json)
    if (!result.success) {
      throw new FallbackSnapshotValidationError(
        `The snapshot from "${path}" does not match the schema of "${snapshotContract.summary}": ${result.error.message}`,
        {
          channel: 'poll',
          path,
          status: response.status,
          issues: result.error.issues,
        },
      )
    }
    return result.data
  }

  function reportEventError(error: FallbackEventValidationError): FallbackEventValidationError {
    diagnostics.onEventSchemaError?.(error)
    return error
  }

  function validateFrame(
    frame: FallbackParsedSseFrame,
    path: string,
  ): FallbackEventValidationError | undefined {
    if (!eventSchemas) return undefined

    const event = frame.event ?? 'message'
    const schema = eventSchemas[event]
    if (!schema) {
      diagnostics.onUndeclaredEvent?.({ path, event })
      return undefined
    }

    let payload: unknown
    try {
      payload = JSON.parse(frame.data)
    } catch (error) {
      return reportEventError(
        new FallbackEventValidationError(
          `SSE event "${event}" from "${path}" carried a payload that is not valid JSON: ${describeCause(error)}`,
          { path, event, data: previewOf(frame.data), cause: error },
        ),
      )
    }

    const result = schema.safeParse(payload)
    if (result.success) return undefined
    return reportEventError(
      new FallbackEventValidationError(
        `SSE event "${event}" from "${path}" does not match its schema: ${result.error.message}`,
        { path, event, data: previewOf(frame.data), issues: result.error.issues },
      ),
    )
  }

  /** Pass raw chunks through untouched, validating the frames they complete. */
  async function* inspectChunks(
    chunks: AsyncIterable<string>,
    path: string,
  ): AsyncGenerator<string> {
    const framer = new SseFramer()
    for await (const chunk of chunks) {
      for (const frame of framer.push(chunk)) {
        validateFrame(frame, path)
      }
      yield chunk
    }
  }

  async function* frameChunks(
    chunks: AsyncIterable<string>,
    path: string,
  ): AsyncGenerator<FallbackParsedSseFrame> {
    const framer = new SseFramer()
    for await (const chunk of chunks) {
      for (const frame of framer.push(chunk)) {
        if (validateFrame(frame, path) && eventValidation === 'drop') continue
        yield frame
      }
    }
  }

  async function fetchSnapshot(
    request: FallbackTransportRequest,
    opts: { signal: AbortSignal },
  ): Promise<FallbackSnapshotResponse> {
    const startedAt = Date.now()
    const prepared = await prepare(request, 'poll', {
      accept: snapshotAccept,
      // A cached poll response would quietly disable the correctness backbone:
      // the fallback would keep "succeeding" while reporting stale state.
      'cache-control': 'no-cache',
    })
    const outcome = await execute(prepared, opts.signal, 'poll')
    const status = outcome.ok ? outcome.response.status : outcome.status
    diagnostics.onSnapshot?.({
      path: prepared.path,
      status,
      durationMs: Date.now() - startedAt,
    })

    if (!outcome.ok) {
      // Non-2xx resolves: the core owns what a status means (retry, give up,
      // or hand it to `onAuthChallenge`).
      return { status, headers: outcome.headers, body: outcome.body }
    }

    const headers = normalizeResponseHeaders(outcome.response)
    return {
      status,
      headers,
      body: await readSnapshotBody(outcome.response, prepared.path, headers['content-type']),
    }
  }

  async function openStream(
    request: FallbackTransportRequest,
    opts: { signal: AbortSignal; lastEventId?: string },
  ): Promise<FallbackStreamResponse> {
    const channelHeaders: Record<string, string> = {
      accept: SSE_ACCEPT,
      'cache-control': 'no-cache',
    }
    // An empty cursor is "no cursor": sending `Last-Event-ID:` with no value
    // asks a spec-following server to replay from the start of the stream.
    if (opts.lastEventId !== undefined && opts.lastEventId !== '') {
      channelHeaders['last-event-id'] = opts.lastEventId
    }

    const prepared = await prepare(request, 'stream', channelHeaders)
    const outcome = await execute(prepared, opts.signal, 'stream')
    const status = outcome.ok ? outcome.response.status : outcome.status
    const headers = outcome.ok ? normalizeResponseHeaders(outcome.response) : outcome.headers
    diagnostics.onStreamOpen?.({
      path: prepared.path,
      status,
      contentType: headers['content-type'],
      lastEventId: opts.lastEventId,
    })

    // A refused connect resolves with no stream: the core reads the status,
    // counts a connect failure, and aborts the request so nothing leaks.
    /* v8 ignore next -- a materialized 2xx fetch response always has a body */
    if (!outcome.ok || !outcome.response.body) {
      return { status, headers, chunks: emptyChunks() }
    }

    const chunks = readTextChunks(outcome.response.body, opts.signal)
    if (streamMode === 'events') {
      return { status, headers, events: frameChunks(chunks, prepared.path) }
    }
    return {
      status,
      headers,
      chunks: eventSchemas ? inspectChunks(chunks, prepared.path) : chunks,
    }
  }

  return { fetchSnapshot, openStream }
}
