import { generateKeyPairSync } from 'node:crypto'
import { EnvaseError, parseEnv } from 'envase'
import { describe, expect, it } from 'vitest'
import { createAppConfigSchema } from './appConfig.ts'

const generateRsaKeyPair = (modulusLength: number) =>
  generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

const { publicKey, privateKey } = generateRsaKeyPair(2048)
const shortPublicKey = generateRsaKeyPair(1024).publicKey
const ecPublicKey = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
}).publicKey

const encodeKey = (pem: string) => pem.replaceAll('\n', '||')

const REQUIRED_ENV = {
  NODE_ENV: 'test',
  APP_ENV: 'development',
  APP_VERSION: '1.2.3',
  GIT_COMMIT_SHA: 'abc123',
  JWT_PUBLIC_KEY: publicKey,
}

describe('createAppConfigSchema', () => {
  it('parses every setting from env vars', () => {
    const config = parseEnv(
      {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        APP_VERSION: '1.2.3',
        GIT_COMMIT_SHA: 'abc123',
        APP_BIND_ADDRESS: '127.0.0.1',
        APP_PORT: '8080',
        JWT_PUBLIC_KEY: encodeKey(publicKey),
        LOG_LEVEL: 'debug',
        BASE_URL: 'https://example.com',
        METRICS_ENABLED: 'false',
        GRACEFUL_SHUTDOWN_TIMEOUT_MS: '5000',
      },
      createAppConfigSchema(),
    )

    expect(config).toStrictEqual({
      nodeEnv: 'production',
      appEnv: 'staging',
      appVersion: '1.2.3',
      gitCommitSha: 'abc123',
      bindAddress: '127.0.0.1',
      port: 8080,
      jwtPublicKey: publicKey,
      logLevel: 'debug',
      baseUrl: 'https://example.com',
      metrics: { isEnabled: false },
      gracefulShutdownTimeoutMs: 5000,
    })
  })

  it('defaults the optional settings', () => {
    const config = parseEnv(REQUIRED_ENV, createAppConfigSchema())

    expect(config).toStrictEqual({
      nodeEnv: 'test',
      appEnv: 'development',
      appVersion: '1.2.3',
      gitCommitSha: 'abc123',
      bindAddress: '0.0.0.0',
      port: 3000,
      jwtPublicKey: publicKey.trim(),
      logLevel: 'info',
      baseUrl: '',
      metrics: { isEnabled: true },
      gracefulShutdownTimeoutMs: 10_000,
    })
  })

  it.each([
    ['a missing NODE_ENV', { ...REQUIRED_ENV, NODE_ENV: undefined }],
    ['a missing JWT_PUBLIC_KEY', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: undefined }],
    ['an empty JWT_PUBLIC_KEY', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: '' }],
    ['a blank JWT_PUBLIC_KEY', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: '  ' }],
    ['a JWT_PUBLIC_KEY that is not a key', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: 'key' }],
    ['a private key as JWT_PUBLIC_KEY', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: privateKey }],
    ['an RSA key shorter than 2048 bits', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: shortPublicKey }],
    ['a non-RSA JWT_PUBLIC_KEY', { ...REQUIRED_ENV, JWT_PUBLIC_KEY: ecPublicKey }],
    ['an unknown APP_ENV', { ...REQUIRED_ENV, APP_ENV: 'qa' }],
    ['an unknown log level', { ...REQUIRED_ENV, LOG_LEVEL: 'verbose' }],
    ['a shutdown timeout above 30s', { ...REQUIRED_ENV, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '30001' }],
  ])('rejects %s', (_, env) => {
    expect(() => parseEnv(env, createAppConfigSchema())).toThrow(EnvaseError)
  })
})
