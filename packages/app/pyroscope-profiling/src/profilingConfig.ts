import type { ProfilingConfig, ProfilingContext } from './types.ts'

type EnvSource = Record<string, string | undefined>

const DEFAULT_SERVER_ADDRESS = 'http://localhost:4040'

const read = (env: EnvSource, key: string): string | undefined => {
  const value = env[key]?.trim()
  return value ? value : undefined
}

const readBoolean = (env: EnvSource, key: string): boolean => {
  const value = read(env, key)?.toLowerCase()
  return value === 'true' || value === '1'
}

export type ProfilingConfigFromEnvOptions = {
  /**
   * Name to file profiles under when `PYROSCOPE_APPLICATION_NAME` is unset.
   * Pass the service name.
   */
  appName?: string
  /** Defaults to `process.env`. Injectable so this stays testable. */
  env?: EnvSource
}

/**
 * Builds a {@link ProfilingConfig} from the `PYROSCOPE_*` environment.
 *
 * Off unless `PYROSCOPE_ENABLED` is `true`: profiles only go somewhere useful
 * once the service is pointed at an ingest endpoint, and the profiler costs a
 * native binding and a few percent of CPU.
 *
 * The three credential variables are read here rather than left to the SDK,
 * which only picks up `PYROSCOPE_AUTH_TOKEN` from the environment and never
 * looks for basic auth or a tenant id.
 */
export function resolveProfilingConfigFromEnv(
  options: ProfilingConfigFromEnvOptions = {},
): ProfilingConfig {
  const env = options.env ?? process.env

  return {
    isEnabled: readBoolean(env, 'PYROSCOPE_ENABLED'),
    appName: read(env, 'PYROSCOPE_APPLICATION_NAME') ?? options.appName ?? '',
    serverAddress: read(env, 'PYROSCOPE_SERVER_ADDRESS') ?? DEFAULT_SERVER_ADDRESS,
    authToken: read(env, 'PYROSCOPE_AUTH_TOKEN'),
    basicAuthUser: read(env, 'PYROSCOPE_BASIC_AUTH_USER'),
    basicAuthPassword: read(env, 'PYROSCOPE_BASIC_AUTH_PASSWORD'),
    tenantId: read(env, 'PYROSCOPE_TENANT_ID'),
  }
}

/**
 * Builds a {@link ProfilingContext} from the deployment variables Lokalise
 * services already set. Anything missing is simply not labelled.
 */
export function resolveProfilingContextFromEnv(env: EnvSource = process.env): ProfilingContext {
  return {
    appEnv: read(env, 'APP_ENV'),
    appVersion: read(env, 'APP_VERSION'),
    gitCommitSha: read(env, 'GIT_COMMIT_SHA'),
  }
}

/**
 * Whether span profiles were asked for, which takes both `PYROSCOPE_ENABLED`
 * and `PYROSCOPE_SPAN_PROFILES_ENABLED`: a label needs a profiler to land on.
 *
 * Read from the environment rather than from a config module because the span
 * processor has to be built in the entry point, before tracing starts and
 * therefore before a config module can be imported.
 */
export function isSpanProfilingEnabledInEnv(env: EnvSource = process.env): boolean {
  return (
    readBoolean(env, 'PYROSCOPE_ENABLED') && readBoolean(env, 'PYROSCOPE_SPAN_PROFILES_ENABLED')
  )
}
