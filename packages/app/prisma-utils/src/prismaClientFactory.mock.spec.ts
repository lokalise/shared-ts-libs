import { PrismaClient } from '@prisma/client'
import { type MockInstance, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatasourceUrl } from '../test/getDatasourceUrl'
import { prismaClientFactory } from './prismaClientFactory'

describe('prismaClientFactory - mocking PrismaClient', () => {
  vi.mock('@prisma/client', () => {
    return {
      PrismaClient: vi.fn(),
    }
  })

  let mockPrismaClient: MockInstance

  beforeEach(() => {
    mockPrismaClient = PrismaClient as unknown as MockInstance
  })

  it('default options', () => {
    prismaClientFactory()

    expect(mockPrismaClient).toHaveBeenCalledWith({
      transactionOptions: { isolationLevel: 'ReadCommitted' },
    })
  })

  it('changing transaction options but not isolation level', () => {
    prismaClientFactory({
      transactionOptions: {
        maxWait: 1000,
        timeout: 1000,
      },
    })

    expect(mockPrismaClient).toHaveBeenCalledWith({
      transactionOptions: {
        isolationLevel: 'ReadCommitted',
        maxWait: 1000,
        timeout: 1000,
      },
    })
  })

  it('setting other options', () => {
    prismaClientFactory({
      datasourceUrl: getDatasourceUrl(),
      errorFormat: 'colorless',
      log: ['query'],
    })

    expect(mockPrismaClient).toHaveBeenCalledWith({
      transactionOptions: { isolationLevel: 'ReadCommitted' },
      datasourceUrl: getDatasourceUrl(),
      errorFormat: 'colorless',
      log: ['query'],
    })
  })
})
