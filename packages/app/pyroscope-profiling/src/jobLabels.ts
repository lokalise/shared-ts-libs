import { type ProfilingLabels, withProfilingLabels } from './labels.ts'

/**
 * Wraps a job processor's entry point so every sample taken while it runs
 * carries `job`.
 *
 * The same thing {@link withProfilingLabels} does, shaped so it can be applied
 * once in an abstract processor instead of remembered in each subclass. That
 * placement is the point: a service whose processors opt in one at a time
 * ends up with some labelled and some not, and partial labelling reports worse
 * than none. The profiler carries one label set for the whole process, so a
 * job that never opens a scope is attributed to whichever labelled scope
 * happens to be open while it runs, and a flame graph filtered to that job
 * then shows work belonging to another.
 *
 * @example Applied once, in the base class every processor extends
 * ```ts
 * abstract class AbstractJobProcessor {
 *   protected abstract readonly queueId: string
 *
 *   public processJob(job: Job, context: RequestContext) {
 *     return withJobLabels(this.queueId, () => this.process(job, context))
 *   }
 *
 *   protected abstract process(job: Job, context: RequestContext): Promise<void>
 * }
 * ```
 */
export function withJobLabels<T>(
  job: string,
  fn: () => Promise<T> | T,
  extraLabels?: ProfilingLabels,
): Promise<T> {
  return withProfilingLabels({ ...extraLabels, job }, fn)
}
