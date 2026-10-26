import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withSpan } from './withSpan.ts'

describe('withSpan', () => {
  const exporter = new InMemorySpanExporter()

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    )
  })

  afterAll(() => {
    trace.disable()
    context.disable()
  })

  beforeEach(() => {
    exporter.reset()
  })

  it('returns the result and ends the span', async () => {
    const result = await withSpan('work', () => 42)

    expect(result).toBe(42)
    const [span] = exporter.getFinishedSpans()
    expect(span?.name).toBe('work')
    expect(span?.status.code).toBe(SpanStatusCode.UNSET)
  })

  it('sets the given attributes', async () => {
    await withSpan('work', { provider: 'bedrock' }, async () => {})

    expect(exporter.getFinishedSpans()[0]?.attributes).toEqual({ provider: 'bedrock' })
  })

  it('passes the span to fn', async () => {
    await withSpan('work', (span) => {
      span.setAttribute('tokens', 7)
    })

    expect(exporter.getFinishedSpans()[0]?.attributes).toEqual({ tokens: 7 })
  })

  it('marks the span as an error and rethrows', async () => {
    await expect(
      withSpan('work', () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const [span] = exporter.getFinishedSpans()
    expect(span?.status.code).toBe(SpanStatusCode.ERROR)
    expect(span?.events[0]?.name).toBe('exception')
    expect(span?.events[0]?.attributes?.['exception.message']).toBe('boom')
  })

  it('records non-Error throws', async () => {
    await expect(
      withSpan('work', () => {
        throw 'nope'
      }),
    ).rejects.toBe('nope')

    expect(exporter.getFinishedSpans()[0]?.events[0]?.attributes?.['exception.message']).toBe(
      'nope',
    )
  })

  it('nests spans under the active span, across awaits', async () => {
    await withSpan('outer', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      await withSpan('inner', () => {})
    })

    const inner = exporter.getFinishedSpans().find((s) => s.name === 'inner')
    const outer = exporter.getFinishedSpans().find((s) => s.name === 'outer')
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId)
  })
})
