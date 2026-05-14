import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { type SseEventCallbacks, sseStreamToCallbacks } from './sseStreamToCallbacks.ts'

async function* makeStream<T>(events: T[]) {
  for (const event of events) {
    yield event
  }
}

type TestEvent =
  | { type: 'update'; data: { id: string }; lastEventId: string; retry: undefined }
  | { type: 'done'; data: { total: number }; lastEventId: string; retry: undefined }

const updateEvent = (id: string): TestEvent => ({
  type: 'update',
  data: { id },
  lastEventId: '',
  retry: undefined,
})

const doneEvent = (total: number): TestEvent => ({
  type: 'done',
  data: { total },
  lastEventId: '',
  retry: undefined,
})

describe('sseStreamToCallbacks', () => {
  it('dispatches events to the correct handlers', async () => {
    const onUpdate = vi.fn()
    const onDone = vi.fn()
    const onDoneCallback = vi.fn()

    sseStreamToCallbacks(makeStream([updateEvent('1'), updateEvent('2'), doneEvent(2)]), {
      onEvent: { update: onUpdate, done: onDone },
      onDone: onDoneCallback,
    })

    await vi.waitFor(() => expect(onDoneCallback).toHaveBeenCalledOnce())
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenNthCalledWith(1, { id: '1' })
    expect(onUpdate).toHaveBeenNthCalledWith(2, { id: '2' })
    expect(onDone).toHaveBeenCalledWith({ total: 2 })
  })

  it('calls onDone when the stream ends naturally', async () => {
    const onDone = vi.fn()

    sseStreamToCallbacks(makeStream([updateEvent('1')]), {
      onEvent: { update: vi.fn(), done: vi.fn() },
      onDone,
    })

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('calls onError when the stream throws', async () => {
    async function* failingStream(): AsyncGenerator<TestEvent> {
      yield updateEvent('1')
      throw new Error('stream failure')
    }

    const onError = vi.fn()

    sseStreamToCallbacks(failingStream(), {
      onEvent: { update: vi.fn(), done: vi.fn() },
      onError,
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(new Error('stream failure'))
  })

  it('passes non-Error throws to onError as-is', async () => {
    async function* throwingStream(): AsyncGenerator<TestEvent> {
      throw 'oops'
    }

    const onError = vi.fn()

    sseStreamToCallbacks(throwingStream(), {
      onEvent: { update: vi.fn(), done: vi.fn() },
      onError,
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError.mock.calls[0]![0]).toBe('oops')
  })

  it('onEvent handlers receive the correct data type per event name', () => {
    expectTypeOf<SseEventCallbacks<TestEvent>['onEvent']['update']>().parameters.toEqualTypeOf<
        [{ id: string }]
    >()
    expectTypeOf<SseEventCallbacks<TestEvent>['onEvent']['done']>().parameters.toEqualTypeOf<
        [{ total: number }]
    >()
  })
})
