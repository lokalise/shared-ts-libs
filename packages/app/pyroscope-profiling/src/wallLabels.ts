import { runningProfiler } from './profiler.ts'

export type WallLabels = Record<string, number | string>

/**
 * Bound on the scopes held open at once. A scope whose owner never closes it (a
 * span that never ends, a process going down mid-request) would otherwise be
 * held forever, so the oldest is dropped to make room.
 */
const MAX_OPEN_SCOPES = 1024

type LabelScope = {
  id: number
  labels: WallLabels
}

/**
 * The profiler's labels are one field on one object: `setWallLabels` replaces
 * the process-wide set that every sample taken afterwards carries, whatever
 * async context it is taken in. Two callers that each snapshot the labels, set
 * their own and put the snapshot back therefore undo each other: the second one
 * to finish restores what the first one had, and that stale set stays on every
 * sample until something else writes labels.
 *
 * So the current set is tracked here instead, as a stack of open scopes shared
 * by every caller in the process. The most recently opened scope is the one
 * applied, closing a scope re-applies whichever is still open underneath, and
 * closing the last one restores the labels that were there before any scope
 * opened.
 *
 * What this cannot do is attribute two concurrent scopes correctly. The
 * profiler has one label set and the samples taken while both are open carry
 * the newer one, so a request profiled next to nine others is labelled by
 * whichever started last. That is inherent to the SDK, not to this stack, and
 * it is why span profiles are worth the most on a local run with a low
 * concurrency and least in a busy shared environment.
 */
const scopes: LabelScope[] = []

/** Labels from before the first scope opened, restored when the last one closes. */
let baseLabels: WallLabels = {}

let nextScopeId = 1

/**
 * The labels the profiler is currently attaching to its samples, or an empty
 * object when profiling is off or the profiler refuses to report them.
 */
export function readWallLabels(): WallLabels {
  try {
    return runningProfiler()?.default.getWallLabels() ?? {}
  } catch {
    return {}
  }
}

/**
 * Attaches `labels` on top of whatever scope is already open and returns a
 * handle for {@link closeLabelScope}, or `undefined` when profiling is off.
 *
 * Throws what the profiler throws (the Windows wall profiler refuses labels
 * outright), leaving no scope behind, so a caller can fall back to running its
 * work unlabelled.
 */
export function openLabelScope(labels: WallLabels): number | undefined {
  const profiler = runningProfiler()
  if (!profiler) return undefined

  if (scopes.length === 0) baseLabels = profiler.default.getWallLabels()
  const current = scopes[scopes.length - 1]?.labels ?? baseLabels
  const scope: LabelScope = { id: nextScopeId++, labels: { ...current, ...labels } }

  if (scopes.length >= MAX_OPEN_SCOPES) scopes.shift()
  scopes.push(scope)
  try {
    profiler.default.setWallLabels(scope.labels)
  } catch (error) {
    dropScope(scope.id)
    throw error
  }
  return scope.id
}

/**
 * Drops a scope and applies the labels of the innermost one still open, or the
 * ones from before any scope opened. A no-op for a scope that is already gone,
 * and for `undefined`, which is what an open returns while profiling is off.
 *
 * Throws what the profiler throws.
 */
export function closeLabelScope(id: number | undefined): void {
  if (id === undefined || !dropScope(id)) return
  const next = scopes[scopes.length - 1]?.labels ?? baseLabels
  runningProfiler()?.default.setWallLabels(next)
}

function dropScope(id: number): boolean {
  const index = scopes.findIndex((scope) => scope.id === id)
  if (index === -1) return false
  scopes.splice(index, 1)
  return true
}
