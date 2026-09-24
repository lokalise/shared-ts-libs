import type { PrismaClient } from 'db-client/client.ts'
import { afterAll, beforeAll, it } from 'vitest'
import { DbDriverEnum } from '../src/types.ts'
import {
  BENCH_TABLE,
  createBenchClient,
  datasetSize,
  detectDbDriver,
  tenantIdSql,
} from './benchDataset.ts'

// Each INSERT is its own implicit transaction; capping its size keeps it well
// under CockroachDB's transaction size limits.
const INSERT_CHUNK_ROWS = 100_000

let prisma: PrismaClient

beforeAll(() => {
  prisma = createBenchClient()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const insertRows = (tenants: [number, number], rows: [number, number]) =>
  prisma.$executeRawUnsafe(`
    INSERT INTO ${BENCH_TABLE} (project_id, n, id, value, words_count)
    SELECT ${tenantIdSql('t')}, n, gen_random_uuid(), 'seed-' || n::text, 0
    FROM generate_series(${tenants[0]}, ${tenants[1]}) AS t,
      generate_series(${rows[0]}, ${rows[1]}) AS n
  `)

// Tenants are numbered from `tenants[0]` to `tenants[1]`, each with rows `n` from 1 to `rowsPerTenant`.
const insertTenants = async (tenants: [number, number], rowsPerTenant: number) => {
  const tenantsPerChunk = Math.max(1, Math.floor(INSERT_CHUNK_ROWS / rowsPerTenant))
  const rowsPerChunk = Math.min(rowsPerTenant, INSERT_CHUNK_ROWS)
  for (let tenant = tenants[0]; tenant <= tenants[1]; tenant += tenantsPerChunk) {
    const lastTenant = Math.min(tenant + tenantsPerChunk - 1, tenants[1])
    for (let row = 1; row <= rowsPerTenant; row += rowsPerChunk) {
      await insertRows([tenant, lastTenant], [row, Math.min(row + rowsPerChunk - 1, rowsPerTenant)])
    }
  }
}

it('seeds the bulk update benchmark dataset', { timeout: 60 * 60 * 1000 }, async () => {
  const { largeTenantRows, smallTenants, smallTenantRows } = datasetSize()

  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${BENCH_TABLE}`)
  // Mirrors the segment table the constant "where" rule targets: the primary key
  // starts with the tenant column, and `id` is unique through its own index.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE ${BENCH_TABLE} (
      project_id UUID NOT NULL,
      n INT4 NOT NULL,
      id UUID NOT NULL,
      value TEXT NOT NULL,
      words_count INT4 NOT NULL,
      PRIMARY KEY (project_id, n),
      CONSTRAINT bench_segment_id_key UNIQUE (id)
    )
  `)

  await insertTenants([0, 0], largeTenantRows)
  await insertTenants([1, smallTenants], smallTenantRows)

  // Without fresh statistics the planner would be choosing on an empty table.
  await prisma.$executeRawUnsafe(
    (await detectDbDriver(prisma)) === DbDriverEnum.COCKROACH_DB
      ? `CREATE STATISTICS bench_stats FROM ${BENCH_TABLE}`
      : `ANALYZE ${BENCH_TABLE}`,
  )
})
