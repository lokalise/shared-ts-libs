import type { SchemaSnapshot } from './snapshot-schema/index.ts'

export interface SnapshotDifference {
  /** Dotted path describing where in the snapshot the difference is located. */
  path: string
  /** `'added'` — only in `after`; `'removed'` — only in `before`; `'changed'` — present in both with different values. */
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

export interface SnapshotDiff {
  equal: boolean
  differences: SnapshotDifference[]
}

/**
 * Performs a strict structural diff between two schema snapshots.
 *
 * No name normalization, no fuzzy matching — every difference (including constraint
 * and index names) is reported. Column ordering is not enforced because columns are
 * keyed by name in the snapshot.
 *
 * Designed to be the conformance check that runs after `markMigrationsApplied`:
 * if this returns `equal: true`, the Drizzle migrations would faithfully rebuild
 * the original (e.g. Prisma-managed) database.
 */
export function diffSchemaSnapshots(before: SchemaSnapshot, after: SchemaSnapshot): SnapshotDiff {
  const differences: SnapshotDifference[] = []
  diffValue(before, after, '', differences)
  return { equal: differences.length === 0, differences }
}

function diffValue(before: unknown, after: unknown, path: string, out: SnapshotDifference[]): void {
  if (before === after) return

  if (isPlainObject(before) && isPlainObject(after)) {
    diffObjects(before, after, path, out)
    return
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    diffArrays(before, after, path, out)
    return
  }

  // One side missing, or primitives differ.
  if (before === undefined && after !== undefined) {
    out.push({ path, kind: 'added', after })
    return
  }
  if (after === undefined && before !== undefined) {
    out.push({ path, kind: 'removed', before })
    return
  }

  out.push({ path, kind: 'changed', before, after })
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: string,
  out: SnapshotDifference[],
): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const sorted = [...keys].sort()
  for (const key of sorted) {
    const childPath = joinPath(path, key)
    const beforeVal = before[key]
    const afterVal = after[key]

    if (!Object.hasOwn(before, key)) {
      out.push({ path: childPath, kind: 'added', after: afterVal })
      continue
    }
    if (!Object.hasOwn(after, key)) {
      out.push({ path: childPath, kind: 'removed', before: beforeVal })
      continue
    }

    diffValue(beforeVal, afterVal, childPath, out)
  }
}

function diffArrays(
  before: unknown[],
  after: unknown[],
  path: string,
  out: SnapshotDifference[],
): void {
  // For our snapshot, arrays are ordered (column lists for keys, enum value order,
  // foreign key column pairings). Treat any difference as a change of the whole array.
  if (before.length !== after.length || before.some((v, i) => !deepEqual(v, after[i]))) {
    out.push({ path, kind: 'changed', before, after })
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (isPlainObject(a) && isPlainObject(b)) return deepEqualObjects(a, b)
  if (Array.isArray(a) && Array.isArray(b)) return deepEqualArrays(a, b)
  return false
}

function deepEqualObjects(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a).sort()
  const bk = Object.keys(b).sort()
  if (ak.length !== bk.length) return false
  for (let i = 0; i < ak.length; i++) {
    const key = ak[i]
    if (key === undefined || key !== bk[i]) return false
    if (!deepEqual(a[key], b[key])) return false
  }
  return true
}

function deepEqualArrays(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) return false
  }
  return true
}

function joinPath(path: string, key: string): string {
  const escaped = escapeKey(key)
  if (path === '') return escaped
  // Bracketed segments like `["a.b"]` attach directly: `parent["a.b"]`, not `parent.["a.b"]`.
  return escaped.startsWith('[') ? `${path}${escaped}` : `${path}.${escaped}`
}

function escapeKey(key: string): string {
  // Keys with dots would break a naive path string; surround them with brackets for clarity.
  if (key.includes('.') || key.includes(' ')) return `["${key.replace(/"/g, '\\"')}"]`
  return key
}
