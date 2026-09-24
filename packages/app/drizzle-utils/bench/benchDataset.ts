import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getCockroachdbDatabaseUrl } from '../test/getCockroachdbDatabaseUrl.ts'

export const BENCH_TABLE = 'bench_segment'

export const benchSegment = pgTable(BENCH_TABLE, {
  project_id: uuid().notNull(),
  n: integer().notNull(),
  id: uuid().notNull(),
  value: text().notNull(),
  words_count: integer().notNull(),
})

const readPositiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`)
  }
  return value
}

/**
 * Tenant 0 is the large one the benchmark updates; the small tenants are there so
 * the table is not one tenant and the planner sees a realistic distribution.
 */
export const datasetSize = () => ({
  largeTenantRows: readPositiveInt('BENCH_LARGE_TENANT_ROWS', 1_000_000),
  smallTenants: readPositiveInt('BENCH_SMALL_TENANTS', 1_000),
  smallTenantRows: readPositiveInt('BENCH_SMALL_TENANT_ROWS', 1_000),
})

// Deterministic, so the benchmark finds the tenants without reading them back.
// `tenant` is a SQL expression, so a whole range of tenants can be seeded in one INSERT.
export const tenantIdSql = (tenant: string | number) =>
  `md5('bench-tenant-' || (${tenant})::text)::uuid`

export const createBenchClient = () => {
  const client = postgres(getCockroachdbDatabaseUrl(), { onnotice: () => {} })
  return { client, db: drizzle({ client }) }
}
