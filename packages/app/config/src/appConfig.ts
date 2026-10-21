import { envvar, type InferEnv } from 'envase'
import { z } from 'zod'

/**
 * Returns the app config schema for envase's `createConfig()`.
 *
 * Spread the schema to add service settings next to it, or replace an entry to change one.
 *
 * @example
 * ```typescript
 * import { createAppConfigSchema } from '@lokalise/config'
 * import { createConfig, envvar } from 'envase'
 * import { z } from 'zod'
 *
 * const config = createConfig(process.env, {
 *   schema: {
 *     app: { ...createAppConfigSchema(), jwtPrivateKey: envvar('JWT_PRIVATE_KEY', z.string()) },
 *   },
 * })
 * ```
 */
export const createAppConfigSchema = () => ({
  nodeEnv: envvar(
    'NODE_ENV',
    z.enum(['production', 'development', 'test']).describe('Application execution environment'),
  ),
  appEnv: envvar(
    'APP_ENV',
    z
      .enum(['production', 'development', 'staging'])
      .describe('Deployment environment for the application'),
  ),
  appVersion: envvar(
    'APP_VERSION',
    z.string().describe('Application version exposed via healthcheck endpoint'),
  ),
  gitCommitSha: envvar(
    'GIT_COMMIT_SHA',
    z.string().describe('Git commit SHA of the deployed version'),
  ),
  bindAddress: envvar(
    'APP_BIND_ADDRESS',
    z
      .string()
      .default('0.0.0.0')
      .describe('HTTP server binding address (e.g., 0.0.0.0 for all interfaces)'),
  ),
  port: envvar(
    'APP_PORT',
    z.coerce.number().int().min(1).max(65535).default(3000).describe('HTTP server listening port'),
  ),
  logLevel: envvar(
    'LOG_LEVEL',
    z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info')
      .describe('Minimum log level for emitted logs'),
  ),
  baseUrl: envvar(
    'BASE_URL',
    z
      .string()
      .default('')
      .describe('Public URL where the application is accessible, used in OpenAPI spec'),
  ),
  metrics: {
    isEnabled: envvar(
      'METRICS_ENABLED',
      z.stringbool().default(true).describe('Whether to enable Prometheus metrics collection'),
    ),
  },
  gracefulShutdownTimeoutMs: envvar(
    'GRACEFUL_SHUTDOWN_TIMEOUT_MS',
    z.coerce
      .number()
      .int()
      .nonnegative()
      .max(30_000)
      .default(10_000)
      .describe('Timeout in milliseconds for graceful shutdown'),
  ),
})

export type AppConfig = InferEnv<ReturnType<typeof createAppConfigSchema>>
