import { describe, expect, it } from 'vitest'
import {
  isSpanProfilingEnabledInEnv,
  resolveProfilingConfigFromEnv,
  resolveProfilingContextFromEnv,
} from './profilingConfig.ts'

describe('resolveProfilingConfigFromEnv', () => {
  it('is off, and points at a local Pyroscope, on an empty environment', () => {
    const config = resolveProfilingConfigFromEnv({ appName: 'my-service', env: {} })

    expect(config).toEqual({
      isEnabled: false,
      appName: 'my-service',
      serverAddress: 'http://localhost:4040',
      authToken: undefined,
      basicAuthUser: undefined,
      basicAuthPassword: undefined,
      tenantId: undefined,
    })
  })

  it('reads the endpoint and every credential the SDK does not read itself', () => {
    const config = resolveProfilingConfigFromEnv({
      appName: 'my-service',
      env: {
        PYROSCOPE_ENABLED: 'true',
        PYROSCOPE_APPLICATION_NAME: 'renamed-service',
        PYROSCOPE_SERVER_ADDRESS: 'https://profiles-prod-eu-west-0.grafana.net',
        PYROSCOPE_AUTH_TOKEN: 'token',
        PYROSCOPE_BASIC_AUTH_USER: '123456',
        PYROSCOPE_BASIC_AUTH_PASSWORD: 'glc_secret',
        PYROSCOPE_TENANT_ID: 'lokalise',
      },
    })

    expect(config).toEqual({
      isEnabled: true,
      appName: 'renamed-service',
      serverAddress: 'https://profiles-prod-eu-west-0.grafana.net',
      authToken: 'token',
      basicAuthUser: '123456',
      basicAuthPassword: 'glc_secret',
      tenantId: 'lokalise',
    })
  })

  it.each(['1', 'TRUE'])('treats %s as on', (value) => {
    expect(resolveProfilingConfigFromEnv({ env: { PYROSCOPE_ENABLED: value } }).isEnabled).toBe(
      true,
    )
  })

  // A deployment template that leaves a variable in place but empty is the
  // normal shape of "not set here", and an empty label value is a filter
  // nobody can use.
  it('treats a blank value as unset', () => {
    const config = resolveProfilingConfigFromEnv({
      appName: 'my-service',
      env: {
        PYROSCOPE_ENABLED: '  ',
        PYROSCOPE_APPLICATION_NAME: '',
        PYROSCOPE_SERVER_ADDRESS: ' ',
        PYROSCOPE_AUTH_TOKEN: '',
      },
    })

    expect(config.isEnabled).toBe(false)
    expect(config.appName).toBe('my-service')
    expect(config.serverAddress).toBe('http://localhost:4040')
    expect(config.authToken).toBeUndefined()
  })

  it('leaves the app name empty when neither the environment nor the caller names one', () => {
    expect(resolveProfilingConfigFromEnv({ env: {} }).appName).toBe('')
  })
})

describe('resolveProfilingContextFromEnv', () => {
  it('reads the deployment identity', () => {
    expect(
      resolveProfilingContextFromEnv({
        APP_ENV: 'production',
        APP_VERSION: '1.2.3@1700000000',
        GIT_COMMIT_SHA: 'abc123',
      }),
    ).toEqual({ appEnv: 'production', appVersion: '1.2.3@1700000000', gitCommitSha: 'abc123' })
  })

  it('reports nothing it was not given', () => {
    expect(resolveProfilingContextFromEnv({})).toEqual({
      appEnv: undefined,
      appVersion: undefined,
      gitCommitSha: undefined,
    })
  })
})

describe('isSpanProfilingEnabledInEnv', () => {
  it('needs both switches, because a label needs a profiler to land on', () => {
    expect(
      isSpanProfilingEnabledInEnv({
        PYROSCOPE_ENABLED: 'true',
        PYROSCOPE_SPAN_PROFILES_ENABLED: 'true',
      }),
    ).toBe(true)
    expect(isSpanProfilingEnabledInEnv({ PYROSCOPE_SPAN_PROFILES_ENABLED: 'true' })).toBe(false)
    expect(isSpanProfilingEnabledInEnv({ PYROSCOPE_ENABLED: 'true' })).toBe(false)
    expect(isSpanProfilingEnabledInEnv({})).toBe(false)
  })
})
