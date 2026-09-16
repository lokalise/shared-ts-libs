/**
 * Span profiles: the half of this package that needs OpenTelemetry.
 *
 * It sits behind its own entry point so the main one stays free of any
 * `@opentelemetry/*` reference, which is what lets a worker or a script depend
 * on this package without installing the tracing SDK.
 */
export { buildPyroscopeSpanProcessors, PyroscopeSpanProcessor } from './spanProfiles.ts'
export type { ProfilingLogger } from './types.ts'
