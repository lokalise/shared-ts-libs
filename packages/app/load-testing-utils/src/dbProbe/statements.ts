import type { EngineSnapshot } from '../types.ts'

/** One line, short enough to sit in a markdown table cell. */
export function normalizeStatement(query: string, maxLength = 160): string {
  const collapsed = query.replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed
}

/**
 * `?top=N`, clamped to `max`, and 0 for anything that is not a positive
 * integer. An unbounded limit would make the probe the slow part of the window
 * it is measuring.
 */
export function parseTop(raw: string | null, max = 50): number {
  if (raw === null) return 0
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return 0
  return Math.min(parsed, max)
}

export const unavailable = (reason: string): EngineSnapshot => ({
  available: false,
  reason,
  statements: 0,
  rowsReturned: 0,
})
