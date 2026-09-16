import { closeLabelScope, openLabelScope, readWallLabels } from './wallLabels.ts'

export type ProfilingLabels = Record<string, number | string>

/**
 * The labels the profiler is currently attaching to its samples, or an empty
 * object when profiling is off.
 */
export function getProfilingLabels(): ProfilingLabels {
  return readWallLabels()
}

/**
 * Runs `fn` with `labels` attached to every wall sample the profiler takes
 * while it is on the stack, then puts the previous labels back.
 *
 * This is how a flame graph gets a filter for work that has no HTTP request
 * behind it, a background job or a scheduled task, where span profiles are not
 * an option. `{ job: 'cache-refresh' }` turns "who spent these 9 seconds" into
 * a query.
 *
 * A no-op beyond calling `fn` when profiling is off, and it never changes what
 * `fn` returns or throws.
 *
 * Two limits worth knowing, both inherited from how the profiler tracks labels.
 * They are not per async context: the profiler carries one label set for the
 * whole process, so work that `fn` starts and does not await is labelled by
 * whatever is current when it resumes, and two calls that overlap both write to
 * the same set, which leaves the samples taken while both are open carrying the
 * labels of whichever started last. Label the outermost unit of work (the job,
 * the message, the request) rather than every function inside it.
 *
 * @example
 * ```ts
 * await withProfilingLabels({ job: 'cache-refresh', tenant: tenantId }, () =>
 *   this.refreshCache(tenantId),
 * )
 * ```
 */
export async function withProfilingLabels<T>(
  labels: ProfilingLabels,
  fn: () => Promise<T> | T,
): Promise<T> {
  let scope: number | undefined
  try {
    scope = openLabelScope(labels)
  } catch {
    // A profiler that refuses labels (the Windows wall profiler does) must not
    // stop the work it was asked to label.
    return await fn()
  }
  if (scope === undefined) return await fn()

  try {
    return await fn()
  } finally {
    try {
      closeLabelScope(scope)
    } catch {
      // Same reason: the labels are diagnostics, `fn`'s result is not.
    }
  }
}
