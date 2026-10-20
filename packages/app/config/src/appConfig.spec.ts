import { EnvaseError, parseEnv } from 'envase'
import { describe, expect, it } from 'vitest'
import { createAppConfigSchema } from './appConfig.ts'

const REQUIRED_ENV = {
  NODE_ENV: 'test',
  APP_ENV: 'development',
  APP_VERSION: '1.2.3',
  GIT_COMMIT_SHA: 'abc123',
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
      logLevel: 'info',
      baseUrl: '',
      metrics: { isEnabled: true },
      gracefulShutdownTimeoutMs: 10_000,
    })
  })

  it.each([
    ['a missing NODE_ENV', { ...REQUIRED_ENV, NODE_ENV: undefined }],
    ['an unknown APP_ENV', { ...REQUIRED_ENV, APP_ENV: 'qa' }],
    ['an unknown log level', { ...REQUIRED_ENV, LOG_LEVEL: 'verbose' }],
    ['a shutdown timeout above 30s', { ...REQUIRED_ENV, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '30001' }],
  ])('rejects %s', (_, env) => {
    expect(() => parseEnv(env, createAppConfigSchema())).toThrow(EnvaseError)
  })
})
