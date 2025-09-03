import { TokenError } from 'fast-jwt'
import { createRequestContext } from '../../tests/createRequestContext.js'
import { TokenDecoder } from './TokenDecoder.js'

/**
 * Concrete test implementation of TokenDecoder for testing purposes
 */
class TestTokenDecoder extends TokenDecoder {
  constructor(verify: (token: string) => Promise<unknown> | unknown) {
    super(verify)
  }
}

describe('TokenDecoder', () => {
  const reqContext = createRequestContext()

  describe('decode', () => {
    describe('success', () => {
      it('should return result when payload is a plain object', async () => {
        // Given
        const payload = { userId: 123, name: 'John Doe' }
        const tokenDecoder = new TestTokenDecoder(() => payload)

        // When
        const result = await tokenDecoder.decode(reqContext, 'dummy-token')

        // Then
        expect(result).toEqual({ result: payload })
      })

      it('should return result when payload is an empty object', async () => {
        // Given
        const payload = {}
        const tokenDecoder = new TestTokenDecoder(() => Promise.resolve(payload))

        // When
        const result = await tokenDecoder.decode(reqContext, 'dummy-token')

        // Then
        expect(result).toEqual({ result: payload })
      })

      it('should return result when payload is an array', async () => {
        // Given
        const payload = [1, 2, 3, 'hello', { nested: 'object' }]
        const tokenDecoder = new TestTokenDecoder(() => Promise.resolve(payload))

        // When
        const result = await tokenDecoder.decode(reqContext, 'dummy-token')

        // Then
        expect(result).toEqual({ result: payload })
      })

      it('should return when payload is not an object', async () => {
        // Given
        const payload = 'hello world'
        const tokenDecoder = new TestTokenDecoder(() => Promise.resolve(payload))

        // When - Then
        await expect(() =>
          tokenDecoder.decode(reqContext, 'dummy-token'),
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `[Error: Decoded token payload is not an object]`,
        )
      })
    })

    describe('error', () => {
      it.each(Object.values(TokenError.codes))(
        'should properly deal with token error codes',
        async (tokenErrorCode) => {
          // Given
          const tokenDecoder = new TestTokenDecoder(() => {
            throw new TokenError(tokenErrorCode)
          })

          // When
          const result = await tokenDecoder.decode(reqContext, 'dummy-token')

          // Then
          expect(result).toEqual({
            error: tokenErrorCode === TokenError.codes.expired ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN',
          })
        },
      )

      it('should handle unexpected error', async () => {
        // Given
        const tokenDecoder = new TestTokenDecoder(() => {
          throw new Error('test error')
        })

        // When - Then
        await expect(
          tokenDecoder.decode(reqContext, 'dummy-token'),
        ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: test error]`)
      })

      it('should handle non error thrown', async () => {
        // Given
        const tokenDecoder = new TestTokenDecoder(() => {
          throw { hello: 'world' }
        })

        // When - Then
        await expect(
          tokenDecoder.decode(reqContext, 'dummy-token'),
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
          {
            "hello": "world",
          }
        `)
      })
    })
  })
})
