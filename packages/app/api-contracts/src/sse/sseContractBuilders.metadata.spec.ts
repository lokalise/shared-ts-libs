import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildSseContract } from './sseContractBuilders.ts'

const SCHEMA = z.object({})
const EVENTS = { data: z.object({ value: z.string() }) }

type Metadata = {
  myTestProp?: string[]
  mySecondTestProp?: number
}

declare module '../apiContracts.ts' {
  interface CommonRouteDefinitionMetadata extends Metadata {}
}

describe('buildSseContract metadata augmentation', () => {
  describe('SSE GET route', () => {
    it('should respect metadata type and reflect it on contract', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/',
        serverSentEventSchemas: EVENTS,
        metadata: {
          myTestProp: ['test'],
          mySecondTestProp: 1,
          extra: 'extra field',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
      expect(contract.metadata).toEqual({
        myTestProp: ['test'],
        mySecondTestProp: 1,
        extra: 'extra field',
      })
    })

    it('should reflect description, summary, and tags on contract', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/',
        serverSentEventSchemas: EVENTS,
        description: 'Stream events',
        summary: 'Event stream',
        tags: ['streaming', 'sse'],
      })

      expect(contract.description).toBe('Stream events')
      expect(contract.summary).toBe('Event stream')
      expect(contract.tags).toEqual(['streaming', 'sse'])
    })
  })

  describe('SSE POST route', () => {
    it('should respect metadata type and reflect it on contract', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/',
        requestBodySchema: SCHEMA,
        serverSentEventSchemas: EVENTS,
        metadata: {
          myTestProp: ['test2'],
          mySecondTestProp: 2,
          extra: 'extra field2',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
      expect(contract.metadata).toEqual({
        myTestProp: ['test2'],
        mySecondTestProp: 2,
        extra: 'extra field2',
      })
    })

    it('should reflect description, summary, and tags on contract', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/',
        requestBodySchema: SCHEMA,
        serverSentEventSchemas: EVENTS,
        description: 'Stream with body',
        summary: 'Body stream',
        tags: ['streaming'],
      })

      expect(contract.description).toBe('Stream with body')
      expect(contract.summary).toBe('Body stream')
      expect(contract.tags).toEqual(['streaming'])
    })
  })

  describe('Dual-mode GET route', () => {
    it('should respect metadata type and reflect it on contract', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/',
        successResponseBodySchema: SCHEMA,
        serverSentEventSchemas: EVENTS,
        metadata: {
          myTestProp: ['test3'],
          mySecondTestProp: 3,
          extra: 'extra field3',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
      expect(contract.metadata).toEqual({
        myTestProp: ['test3'],
        mySecondTestProp: 3,
        extra: 'extra field3',
      })
    })

    it('should reflect description, summary, and tags on contract', () => {
      const contract = buildSseContract({
        method: 'get',
        pathResolver: () => '/',
        successResponseBodySchema: SCHEMA,
        serverSentEventSchemas: EVENTS,
        description: 'Dual-mode GET',
        summary: 'GET dual',
        tags: ['dual-mode', 'sse'],
      })

      expect(contract.description).toBe('Dual-mode GET')
      expect(contract.summary).toBe('GET dual')
      expect(contract.tags).toEqual(['dual-mode', 'sse'])
    })
  })

  describe('Dual-mode POST route', () => {
    it('should respect metadata type and reflect it on contract', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/',
        requestBodySchema: SCHEMA,
        successResponseBodySchema: SCHEMA,
        serverSentEventSchemas: EVENTS,
        metadata: {
          myTestProp: ['test4'],
          mySecondTestProp: 4,
          extra: 'extra field4',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
      expect(contract.metadata).toEqual({
        myTestProp: ['test4'],
        mySecondTestProp: 4,
        extra: 'extra field4',
      })
    })

    it('should reflect description, summary, and tags on contract', () => {
      const contract = buildSseContract({
        method: 'post',
        pathResolver: () => '/',
        requestBodySchema: SCHEMA,
        successResponseBodySchema: SCHEMA,
        serverSentEventSchemas: EVENTS,
        description: 'Dual-mode POST',
        summary: 'POST dual',
        tags: ['dual-mode'],
      })

      expect(contract.description).toBe('Dual-mode POST')
      expect(contract.summary).toBe('POST dual')
      expect(contract.tags).toEqual(['dual-mode'])
    })
  })
})
