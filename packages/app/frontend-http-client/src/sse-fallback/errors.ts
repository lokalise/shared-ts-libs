import type { z } from 'zod/v4'
import type { FallbackChannel } from './types.ts'

export type FallbackErrorContext = {
  channel: FallbackChannel
  /** Request path the failure belongs to, including the path prefix. */
  path: string
  /** HTTP status, when the failure happened after a response was received. */
  status?: number
  cause?: unknown
}

/**
 * Base class for every failure this transport rejects with.
 *
 * The fallback client core treats a rejected `fetchSnapshot` as a poll failure
 * (backoff, retry, `diagnostics.onPollError`) and a rejected `openStream` as a
 * connect failure (backoff, degradation, `diagnostics.onStreamError`). Rejecting
 * is therefore never fatal — but it is also never silent, which is why every
 * rejection carries the channel and path that produced it.
 */
export class FallbackTransportError extends Error {
  readonly channel: FallbackChannel
  readonly path: string
  readonly status: number | undefined

  constructor(message: string, context: FallbackErrorContext) {
    super(message, context.cause !== undefined ? { cause: context.cause } : undefined)
    this.name = 'FallbackTransportError'
    this.channel = context.channel
    this.path = context.path
    this.status = context.status
  }
}

/**
 * A snapshot body did not match the contract's schema.
 *
 * Rejected rather than delivered: an unvalidated body reaching
 * `snapshotToEvents` / `version.ofSnapshot` / `state.init` turns a schema drift
 * into a wrong version watermark, and a wrong watermark silently drops the
 * stream's events from then on. A poll failure is recoverable; a poisoned
 * watermark is not.
 */
export class FallbackSnapshotValidationError extends FallbackTransportError {
  readonly issues: readonly z.core.$ZodIssue[]

  constructor(
    message: string,
    context: FallbackErrorContext & { issues: readonly z.core.$ZodIssue[] },
  ) {
    super(message, context)
    this.name = 'FallbackSnapshotValidationError'
    this.issues = context.issues
  }
}

/**
 * The poll branch answered with something that cannot be a snapshot: a
 * representation the contract does not declare for that status, an SSE stream
 * (the `Accept` negotiation went to the wrong branch), a binary body, or no
 * body at all.
 */
export class FallbackUnexpectedSnapshotError extends FallbackTransportError {
  readonly contentType: string | undefined
  /** Response text, when it was read and small enough to be useful. */
  readonly bodyPreview: string | undefined

  constructor(
    message: string,
    context: FallbackErrorContext & { contentType?: string; bodyPreview?: string },
  ) {
    super(message, context)
    this.name = 'FallbackUnexpectedSnapshotError'
    this.contentType = context.contentType
    this.bodyPreview = context.bodyPreview
  }
}

export type FallbackParamsPart = 'pathParams' | 'queryParams' | 'body'

/**
 * Subscription params did not match the contract's request schemas. Thrown by
 * `buildFallbackParams` at subscription-creation time, rather than letting the
 * mistake become a 400/404 the subscription retries on a backoff.
 */
export class FallbackParamsValidationError extends Error {
  readonly part: FallbackParamsPart
  /** `summary` of the contract the params were built for. */
  readonly summary: string
  readonly issues: readonly z.core.$ZodIssue[]

  constructor(
    message: string,
    context: { part: FallbackParamsPart; summary: string; issues: readonly z.core.$ZodIssue[] },
  ) {
    super(message)
    this.name = 'FallbackParamsValidationError'
    this.part = context.part
    this.summary = context.summary
    this.issues = context.issues
  }
}

/**
 * A param is valid per the contract but cannot be expressed in a fallback
 * subscription request — a repeated/structured query parameter, which the
 * binding's flat `Record<string, string>` query cannot carry.
 */
export class FallbackUnsupportedParamError extends Error {
  readonly part: FallbackParamsPart
  readonly summary: string
  readonly param: string

  constructor(
    message: string,
    context: { part: FallbackParamsPart; summary: string; param: string },
  ) {
    super(message)
    this.name = 'FallbackUnsupportedParamError'
    this.part = context.part
    this.summary = context.summary
    this.param = context.param
  }
}

/**
 * An SSE frame's payload did not match the contract's schema for its event
 * name (or was not valid JSON at all).
 *
 * Never thrown: it is reported to `diagnostics.onEventSchemaError`, and with
 * `eventValidation: 'drop'` the frame is withheld from the core so a poll
 * repairs the gap instead of app code receiving a payload it cannot trust.
 */
export class FallbackEventValidationError extends Error {
  readonly path: string
  readonly event: string
  readonly data: string
  readonly issues: readonly z.core.$ZodIssue[] | undefined

  constructor(
    message: string,
    context: {
      path: string
      event: string
      data: string
      issues?: readonly z.core.$ZodIssue[]
      cause?: unknown
    },
  ) {
    super(message, context.cause !== undefined ? { cause: context.cause } : undefined)
    this.name = 'FallbackEventValidationError'
    this.path = context.path
    this.event = context.event
    this.data = context.data
    this.issues = context.issues
  }
}
