import { runningProfiler } from './profiler.ts'

export type ProfilingLabels = Record<string, number | string>

/**
 * The labels the profiler is currently attaching to its samples, or an empty
 * object when profiling is off.
 */
export function getProfilingLabels(): ProfilingLabels {
  try {
    return runningProfiler()?.default.getWallLabels() ?? {}
  } catch {
    return {}
  }
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
 * They live in an async context, so work that `fn` starts and does not await
 * lands wherever it resumes, which can be after the labels have been put back.
 * And concurrent calls in the same process interleave: the profiler holds one
 * current label set per async context chain, not one per call, so overlapping
 * invocations can read each other's labels. Label the outermost unit of work
 * (the job, the message, the request) rather than every function inside it.
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
  const profiler = runningProfiler()
  if (!profiler) return await fn()

  let previous: ProfilingLabels
  try {
    previous = profiler.default.getWallLabels()
    profiler.default.setWallLabels({ ...previous, ...labels })
  } catch {
    // A profiler that refuses labels (the Windows wall profiler does) must not
    // stop the work it was asked to label.
    return await fn()
  }

  try {
    return await fn()
  } finally {
    try {
      profiler.default.setWallLabels(previous)
    } catch {
      // Same reason: the labels are diagnostics, `fn`'s result is not.
    }
  }
}
