import { defineApiContract, sseResponse } from '@lokalise/api-contracts'
import { describe, expect, expectTypeOf, it } from 'vitest'
import wretch from 'wretch'
import { z } from 'zod/v4'
import { createFallbackTransport } from './createFallbackTransport.ts'
import type {
  FallbackEventsOf,
  FallbackSnapshotOf,
  FallbackTransport as VendoredFallbackTransport,
} from './types.ts'

// ============================================================================
// The seam, copied verbatim from @opinionated-machine/sse-fallback
// ============================================================================
//
// This package deliberately does not depend on the fallback core: the two
// sides meet structurally, so a consumer installs whichever core version they
// like. That only holds while the shapes match, and a mismatch that surfaced
// as a wall of assignability errors at some app's `createResilientSubscription`
// call would be a poor way to find out. So the core's declarations live here,
// copied, and the assertions below fail the moment the vendored copy drifts.

type CoreTransportRequest = {
  path: string
  method: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
}

type CoreSnapshotResponse = {
  status: number
  headers: Record<string, string>
  body: unknown
}

type CoreParsedSseFrame = {
  id?: string
  event?: string
  data: string
  retry?: number
  lastEventId?: string
}

type CoreRawStreamResponse = {
  status: number
  headers: Record<string, string>
  chunks: AsyncIterable<string>
}

type CoreParsedStreamResponse = {
  status: number
  headers: Record<string, string>
  events: AsyncIterable<CoreParsedSseFrame>
}

type CoreStreamResponse = CoreRawStreamResponse | CoreParsedStreamResponse

type CoreFallbackTransport = {
  fetchSnapshot(
    request: CoreTransportRequest,
    opts: { signal: AbortSignal },
  ): Promise<CoreSnapshotResponse>
  openStream(
    request: CoreTransportRequest,
    opts: { signal: AbortSignal; lastEventId?: string },
  ): Promise<CoreStreamResponse>
}

const snapshotSchema = z.object({ version: z.number(), status: z.enum(['pending', 'done']) })

const dualModeContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload status',
  method: 'get',
  pathResolver: () => '/uploads/u-1/status',
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
    404: z.object({ message: z.string() }),
  },
})

describe('the fallback transport seam', () => {
  it('produces a transport the fallback client core accepts', () => {
    const transport = createFallbackTransport(wretch('https://example.com'), {
      contract: dualModeContract,
    })

    expectTypeOf(transport).toExtend<CoreFallbackTransport>()
    // And the other direction, so a core-provided transport (its bundled
    // `TestTransport`, say) can be handed to anything typed against ours.
    expectTypeOf<CoreFallbackTransport>().toExtend<VendoredFallbackTransport>()

    expect(transport.fetchSnapshot).toBeTypeOf('function')
    expect(transport.openStream).toBeTypeOf('function')
  })

  it('derives the binding snapshot type from the contract', () => {
    expectTypeOf<FallbackSnapshotOf<typeof dualModeContract>>().toEqualTypeOf<{
      version: number
      status: 'pending' | 'done'
    }>()
  })

  it('derives the binding event payload map from the contract', () => {
    expectTypeOf<FallbackEventsOf<typeof dualModeContract>>().toEqualTypeOf<{
      uploadFinished: { version: number; result: string }
      progress: { version: number; percent: number }
    }>()
  })
})
