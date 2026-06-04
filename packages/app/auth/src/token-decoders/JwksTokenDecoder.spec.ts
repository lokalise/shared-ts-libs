import jwksClient from 'jwks-rsa'
import { createRequestContext } from '../../tests/createRequestContext.ts'
import { createToken } from '../../tests/createToken.ts'
import { JwksServer } from '../../tests/JwksServer.ts'
import { createTestContext, type TestContext } from '../../tests/testContext.ts'
import { JwksTokenDecoder } from './JwksTokenDecoder.ts'

describe('JwksTokenDecoder', () => {
  const reqContext = createRequestContext()

  let testContext: TestContext
  let jwksServer: JwksServer
  let tokenDecoder: JwksTokenDecoder

  beforeAll(async () => {
    testContext = await createTestContext('myKeyId')
    jwksServer = new JwksServer()
    await jwksServer.start(testContext)
    tokenDecoder = new JwksTokenDecoder(
      jwksClient({
        jwksUri: jwksServer.jwksUrl,
        cache: false, // not using cache to better test error scenarios
      }),
      {
        algorithms: ['RS256'],
        clockTolerance: 30,
        requiredClaims: ['exp'],
      },
    )
  })

  afterAll(async () => {
    await jwksServer.stop()
  })

  describe('decode', () => {
    describe('successful verification', () => {
      it('successfully verifies and extracts payload with kid in header', async () => {
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

      it('successfully verifies and extracts payload without kid in header', async () => {
        // Given
        // Remove kid from header to force getFirstAvailableKey call
        const token = await createToken(testContext, { foo: 'bar' }, { kid: undefined })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining({
            foo: 'bar',
          }),
        })
      })

      it('successfully verifies payload with nbf (not before) claim', async () => {
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
    })

    describe('invalid token format', () => {
      it('returns INVALID_TOKEN error for malformed JWT', async () => {
        // Given
        const malformedToken = 'header.payload.signature'

        // When
        const result = await tokenDecoder.decode(reqContext, malformedToken)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })

      it('returns INVALID_TOKEN error for JWT with invalid signature', async () => {
        // Given
        // Create a valid JWT and then tamper with its signature
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
      it('returns INVALID_TOKEN error when exp claim is missing', async () => {
        // Given
        const token = await createToken(testContext, { foo: 'bar', exp: undefined })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })

      it('returns INVALID_TOKEN error when exp claim is not a number', async () => {
        // Given
        const token = await createToken(testContext, { exp: 'not-a-number' })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })

      it('returns EXPIRED_TOKEN error when token is expired', async () => {
        // Given
        const exp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        const token = await createToken(testContext, { exp })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'EXPIRED_TOKEN' })
      })

      it('returns INVALID_TOKEN error when token is not yet valid (nbf)', async () => {
        // Given
        const nbf = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        const token = await createToken(testContext, { nbf })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })
    })

    describe('JWKS client errors', () => {
      it('returns INVALID_TOKEN error when JWKS endpoint is unreachable', async () => {
        // Given
        await jwksServer.stop() // Make JWKS endpoint unreachable
        const token = await createToken(testContext, { foo: 'bar' })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })

        // Restart the server for other tests
        await jwksServer.start(testContext)
      })

      it('returns INVALID_TOKEN error when specified kid is not found', async () => {
        // Given
        const token = await createToken(testContext, { foo: 'bar' }, { kid: 'non-existent-key' })

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })
    })

    describe('empty string kid', () => {
      let emptyKidContext: TestContext
      let emptyKidServer: JwksServer
      let client: ReturnType<typeof jwksClient>
      let emptyKidDecoder: JwksTokenDecoder

      beforeAll(async () => {
        emptyKidContext = await createTestContext('')
        emptyKidServer = new JwksServer()
        await emptyKidServer.start(emptyKidContext)
      })

      afterAll(async () => {
        await emptyKidServer.stop()
      })

      beforeEach(() => {
        // Fresh client per test so the lru-memoizer cache starts empty.
        client = jwksClient({
          jwksUri: emptyKidServer.jwksUrl,
          cache: true,
        })
        emptyKidDecoder = new JwksTokenDecoder(client, {
          algorithms: ['RS256'],
          clockTolerance: 30,
          requiredClaims: ['exp'],
        })
      })

      it('verifies the token and resolves the key with a normalized (undefined) kid', async () => {
        // Given
        const getSigningKeySpy = vi.spyOn(client, 'getSigningKey')
        const token = await createToken(emptyKidContext, { foo: 'bar' })

        // When
        const result = await emptyKidDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({
          result: expect.objectContaining({ foo: 'bar' }),
        })
        expect(getSigningKeySpy).toHaveBeenCalledWith(undefined)
      })

      it('serves repeated decodes from cache instead of refetching the JWKS each time', async () => {
        // Given
        const getSigningKeysSpy = vi.spyOn(client, 'getSigningKeys')
        const token = await createToken(emptyKidContext, { foo: 'bar' })

        // When
        await emptyKidDecoder.decode(reqContext, token)
        await emptyKidDecoder.decode(reqContext, token)

        // Then
        expect(getSigningKeysSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('cryptographic verification', () => {
      it('rejects JWT signed with different key', async () => {
        // Given
        // Generate a different key pair
        const testContext2 = await createTestContext()
        const token = await createToken(testContext2)

        // When
        const result = await tokenDecoder.decode(reqContext, token)

        // Then
        expect(result).toEqual({ error: 'INVALID_TOKEN' })
      })
    })
  })
})
