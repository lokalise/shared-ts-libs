/**
 * Six-level structural logger.
 *
 * Declared with method syntax rather than function properties so that a pino
 * logger (`@lokalise/node-core`'s `CommonLogger`, Fastify's `app.log`) is
 * assignable to it, and so that it is in turn assignable to the Pyroscope SDK's
 * own `Logger`, which is what {@link startProfiling} hands the SDK. Depending on
 * a logging package for a type alone would be the only runtime dependency this
 * package does not need.
 */
export interface ProfilingLogger {
  trace(obj: unknown, msg?: string, ...args: unknown[]): void
  trace(msg: string, ...args: unknown[]): void
  debug(obj: unknown, msg?: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  info(obj: unknown, msg?: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(obj: unknown, msg?: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(obj: unknown, msg?: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  fatal(obj: unknown, msg?: string, ...args: unknown[]): void
  fatal(msg: string, ...args: unknown[]): void
}

/**
 * Where profiles are shipped and under which name.
 *
 * Sampling knobs are deliberately absent. The Pyroscope SDK reads its own
 * `PYROSCOPE_WALL_*` and `PYROSCOPE_HEAP_*` variables, and anything passed
 * through `init()` outranks them, so a second name for the same setting would
 * silently override whatever an environment set. See the README, "Sampling
 * rates".
 */
export type ProfilingConfig = {
  isEnabled: boolean
  /** Name the profiles are filed under in Pyroscope, e. g. the service name. */
  appName: string
  /** Pyroscope ingest endpoint, e. g. `http://pyroscope.monitoring:4040`. */
  serverAddress: string
  /** Bearer token. Takes precedence over basic auth when both are set. */
  authToken?: string
  /** Basic auth user. For Grafana Cloud Profiles this is the numeric stack id. */
  basicAuthUser?: string
  /** Basic auth password, i. e. the Grafana Cloud access token. */
  basicAuthPassword?: string
  /** `X-Scope-OrgID` for a multi-tenant Pyroscope. */
  tenantId?: string
}

/**
 * Identity of the running instance, attached to every profile as Pyroscope
 * labels so a flame graph can be narrowed to one environment, release or pod.
 *
 * Every field is optional: a label whose value is missing is left out rather
 * than shipped empty, because an empty label value is a filter nobody can use.
 */
export type ProfilingContext = {
  /** Shipped as `env`. */
  appEnv?: string
  /** Shipped as `version`, with a trailing `@<build timestamp>` stripped. */
  appVersion?: string
  /** Shipped as `commit_sha`. */
  gitCommitSha?: string
  /** Shipped as `instance`. Defaults to the hostname, which is the pod name in Kubernetes. */
  instance?: string
  /** Extra labels, merged last, so they can also replace any of the above. */
  tags?: Record<string, string>
}
