import { createRequestContextPreHandler } from './createRequestContextPreHandler.ts'
import { FakeLogger } from '../../../tests/FakeLogger.ts'

describe('createRequestContextPreHandler', () => {
  it('should create prehandler and it should return metadata correlation id', () => {
    // Given
    const logger = new FakeLogger()
    const childSpy = vi.spyOn(logger, 'child')

    // When
    const handler = createRequestContextPreHandler(logger)
    const output = {}
    handler(
      {
        id: '',
        type: '',
        payload: {},
        timestamp: new Date().toISOString(),
        metadata: {
          correlationId: '1234',
          producedBy: '',
          schemaVersion: '',
          originatedFrom: '',
        },
      },
      {},
      output,
      () => undefined,
    )

    // Then
    expect(output).toEqual({
      requestContext: {
        reqId: '1234',
        logger: logger,
      },
    })
    expect(childSpy).toHaveBeenCalledWith({ 'x-request-id': '1234' })
  })
})
