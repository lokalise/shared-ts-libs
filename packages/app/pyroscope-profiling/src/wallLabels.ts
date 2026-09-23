import { toLabelName } from './labelNames.ts'
import { runningProfiler } from './profiler.ts'

export type WallLabels = Record<string, number | string>

/**
 * Bound on the scopes held open at once. A scope whose owner never closes it (a
 * span that never ends, a process going down mid-request) would otherwise be
 * held forever, so the oldest is dropped to make room.
 */
const MAX_OPEN_SCOPES = 1024

/**
 * How often an open scope is re-applied when the profiler is found carrying
 * something else. See {@link reapplyLabels} for what it is there to survive.
 */
const REAPPLY_INTERVAL_MS = 1_000

type LabelValue = { scope: number; value: number | string }

/**
 * The profiler's labels are one field on one object: `setWallLabels` replaces
 * the process-wide set that every sample taken afterwards carries, whatever
 * async context it is taken in. Two callers that each snapshot the labels, set
 * their own and put the snapshot back therefore undo each other: the second one
 * to finish restores what the first one had, and that stale set stays on every
 * sample until something else writes labels.
 *
 * So the current set is tracked here instead, shared by every caller in the
 * process: the keys each open scope set, and per key every value the open
 * scopes gave it, oldest first. The last value for a key is the one applied, a
 * scope that closes takes its own out whether or not it was the innermost, and
 * closing the last scope leaves the labels that were there before any opened.
 *
 * Kept this way round rather than as a merged set per scope so that opening and
 * closing cost the size of one label set instead of the number of scopes open.
 * That number is one or two per request in flight, and a merge per open would
 * make labelling cost the square of the concurrency it was measuring.
 *
 * What this cannot do is attribute two concurrent scopes correctly. The
 * profiler has one label set and the samples taken while both are open carry
 * the newer one, so a request profiled next to nine others is labelled by
 * whichever started last. That is inherent to the SDK, not to this bookkeeping,
 * and it is why span profiles are worth the most on a local run with a low
 * concurrency and least in a busy shared environment.
 */
const keysByScope = new Map<number, string[]>()

const valuesByKey = new Map<string, LabelValue[]>()

/** Labels from before the first scope opened, restored when the last one closes. */
let baseLabels: WallLabels = {}

let nextScopeId = 1

let reapplyTimer: NodeJS.Timeout | undefined

/**
 * The labels the profiler is currently attaching to its samples, or an empty
 * object when profiling is off or the profiler refuses to report them.
 *
 * A copy, because the SDK hands back the object it is reading from: a caller
 * that wrote to it would change what every later sample carries.
 */
export function readWallLabels(): WallLabels {
  try {
    return { ...runningProfiler()?.default.getWallLabels() }
  } catch {
    return {}
  }
}

/**
 * Attaches `labels` on top of whatever scopes are already open and returns a
 * handle for {@link closeLabelScope}, or `undefined` when profiling is off.
 * Their names go through {@link toLabelNames} first.
 *
 * Throws what the profiler throws (the Windows wall profiler refuses labels
 * outright), leaving no scope behind, so a caller can fall back to running its
 * work unlabelled.
 */
export function openLabelScope(labels: WallLabels): number | undefined {
  const profiler = runningProfiler()
  if (!profiler) return undefined

  const named = toLabelNames(labels)
  if (keysByScope.size === 0) baseLabels = { ...profiler.default.getWallLabels() }
  if (keysByScope.size >= MAX_OPEN_SCOPES) {
    const oldest = keysByScope.keys().next().value
    if (oldest !== undefined) dropScope(oldest)
  }

  const id = nextScopeId++
  keysByScope.set(id, Object.keys(named))
  for (const [key, value] of Object.entries(named)) {
    const held = valuesByKey.get(key)
    if (held) held.push({ scope: id, value })
    else valuesByKey.set(key, [{ scope: id, value }])
  }

  try {
    profiler.default.setWallLabels(effectiveLabels())
  } catch (error) {
    dropScope(id)
    if (keysByScope.size === 0) stopReapplying()
    throw error
  }
  startReapplying()
  return id
}

/**
 * Drops a scope and applies what the ones still open set, or the labels from
 * before any scope opened. A no-op for a scope that is already gone, and for
 * `undefined`, which is what an open returns while profiling is off.
 *
 * Throws what the profiler throws.
 */
export function closeLabelScope(id: number | undefined): void {
  if (id === undefined || !dropScope(id)) return
  if (keysByScope.size === 0) stopReapplying()
  runningProfiler()?.default.setWallLabels(effectiveLabels())
}

/**
 * The same rule the init tags go through: a name Pyroscope cannot read as a
 * Prometheus name gets the whole series rejected at ingest, and the exporter
 * reports that through `debug` and swallows it, so `{ 'tenant-id': '42' }`
 * would otherwise cost every sample taken under it with nothing in the log to
 * say so. Two keys that sanitize onto one name leave the last one, as they do
 * at init.
 */
function toLabelNames(labels: WallLabels): WallLabels {
  const named: WallLabels = {}
  for (const [key, value] of Object.entries(labels)) named[toLabelName(key)] = value
  return named
}

function effectiveLabels(): WallLabels {
  const labels: WallLabels = { ...baseLabels }
  for (const [key, held] of valuesByKey) {
    const current = held[held.length - 1]
    if (current) labels[key] = current.value
  }
  return labels
}

function dropScope(id: number): boolean {
  const keys = keysByScope.get(id)
  if (!keys) return false
  keysByScope.delete(id)

  for (const key of keys) {
    const held = valuesByKey.get(key)
    if (!held) continue
    const index = held.findIndex((value) => value.scope === id)
    if (index !== -1) held.splice(index, 1)
    if (held.length === 0) valuesByKey.delete(key)
  }
  return true
}

/**
 * The SDK opens every flush window with an empty label set: the wall profiler
 * clears its context as it hands the profile over, and nothing tells a caller
 * that it happened. Work that outlives one flush interval (60 seconds by
 * default) would otherwise carry its labels through the first window and none
 * after it, which is most of a nine-second job's samples missing the `job`
 * label it was cut by. Re-applying on a timer bounds that to one interval of
 * samples per flush instead.
 */
function reapplyLabels(): void {
  if (keysByScope.size === 0) return
  const profiler = runningProfiler()
  if (!profiler) return

  try {
    const wanted = effectiveLabels()
    if (!sameLabels(profiler.default.getWallLabels(), wanted)) {
      profiler.default.setWallLabels(wanted)
    }
  } catch {
    // A profiler that refuses labels refuses them on every tick as well, and
    // whoever opened the scope was already told at the open.
  }
}

const sameLabels = (left: WallLabels, right: WallLabels): boolean => {
  const keys = Object.keys(right)
  return Object.keys(left).length === keys.length && keys.every((key) => left[key] === right[key])
}

function startReapplying(): void {
  if (reapplyTimer) return
  reapplyTimer = setInterval(reapplyLabels, REAPPLY_INTERVAL_MS)
  // Diagnostics are never a reason for a process to stay up.
  reapplyTimer.unref()
}

function stopReapplying(): void {
  if (!reapplyTimer) return
  clearInterval(reapplyTimer)
  reapplyTimer = undefined
}
