import { createRequestContext } from '../../tests/createRequestContext.js'
import { createToken } from '../../tests/createToken.js'
import { createTestContext, type TestContext } from '../../tests/testContext.js'
import { KeyBasedTokenDecoder } from './KeyBasedTokenDecoder.js'

describe('KeyBasedTokenDecoder', () => {
  const reqContext = createRequestContext()

  let testContext: TestContext
  let tokenDecoder: KeyBasedTokenDecoder

  beforeAll(async () => {
    testContext = await createTestContext()
    tokenDecoder = new KeyBasedTokenDecoder(testContext.publicKeyPem, {
      algorithms: ['RS256'],
      clockTolerance: 30,
      requiredClaims: ['exp'],
    })
  })

  describe('decode', () => {
    describe('successful verification', () => {
      it('should verifies and extracts payload', async () => {
        // Given
        const token = await createToken(testContext, { foo: 'bar' })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining({
            foo: 'bar',
          }),
        })
      })

      it('should verifies payload with nbf (not before) claim', async () => {
        // Given
        const nbf = Math.floor(Date.now() / 1000) - 100 // 100 seconds ago
        const token = await createToken(testContext, { nbf, foo: 'bar' })
        // When

        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining({
            nbf,
            foo: 'bar',
          }),
        })
      })

      it('should handle empty payload', async () => {
        // Given
        const token = await createToken(testContext, {})

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining({
            exp: expect.any(Number),
          }),
        })
      })

      it('should handle payload with complex nested objects', async () => {
        // Given
        const complexPayload = {
          user: {
            id: 123,
            name: 'John Doe',
            roles: ['admin', 'user'],
            metadata: {
              lastLogin: new Date().toISOString(),
              preferences: {
                theme: 'dark',
                notifications: true,
              },
            },
          },
          permissions: ['read', 'write'],
        }
        const token = await createToken(testContext, complexPayload)

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining(complexPayload),
        })
      })

      it('should handle payload with special characters and unicode', async () => {
        // Given
        const specialPayload = {
          message: 'Hello 世界! 🌍',
          specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
          unicode: '🚀🎉💯',
        }
        const token = await createToken(testContext, specialPayload)

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining(specialPayload),
        })
      })
    })

    describe('invalid token format', () => {
      it('should return INVALID_TOKEN error for malformed token', async () => {
        // Given
        const malformedToken = 'header.payload.signature'

        // When
        const result = await tokenDecoder.decode(reqContext, malformedToken)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })

      it('should return INVALID_TOKEN error for token with invalid signature', async () => {
        // Given
        // Create a valid token and then tamper with its signature
        const token = await createToken(testContext)
        const parts = token.split('.')
        const tamperedToken = `${parts[0]}.${parts[1]}.invalid-signature`

        // When
        const result = await tokenDecoder.decode(reqContext, tamperedToken)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })
    })

    describe('payload validation', () => {
      it('should return INVALID_TOKEN error when exp claim is missing', async () => {
        // Given
        const token = await createToken(testContext, { exp: undefined })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })

      it('should return INVALID_TOKEN error when exp claim is not a number', async () => {
        // Given
        const token = await createToken(testContext, { exp: 'hello-world' })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })

      it('should return EXPIRED_TOKEN error when token is expired', async () => {
        // Given
        const exp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        const token = await createToken(testContext, { exp })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'EXPIRED_TOKEN' })
      })

      it('should return INVALID_TOKEN error when token is not yet valid (nbf)', async () => {
        // Given
        const nbf = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        const token = await createToken(testContext, { nbf })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })
    })

    describe('cryptographic verification', () => {
      it('should reject token signed with different key', async () => {
        // Given
        // Generate token with
        const testContext2 = await createTestContext()
        const token = await createToken(testContext2, { foo: 'bar' })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })
    })
  })
})
