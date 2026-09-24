import { afterAll, it } from 'vitest'
import { BENCH_TABLE, createBenchClient, datasetSize, tenantIdSql } from './benchDataset.ts'

// Each INSERT is its own implicit transaction; capping its size keeps it well
// under CockroachDB's transaction size limits.
const INSERT_CHUNK_ROWS = 100_000

const { client } = createBenchClient()

afterAll(async () => {
  await client.end()
})

const insertRows = (tenants: [number, number], rows: [number, number]) =>
  client.unsafe(`
    INSERT INTO ${BENCH_TABLE} (project_id, n, id, value, words_count)
    SELECT ${tenantIdSql('t')}, n, gen_random_uuid(), 'seed-' || n::text, 0
    FROM generate_series(${tenants[0]}, ${tenants[1]}) AS t,
      generate_series(${rows[0]}, ${rows[1]}) AS n
  `)

it('seeds the bulk update benchmark dataset', { timeout: 60 * 60 * 1000 }, async () => {
  const { largeTenantRows, smallTenants, smallTenantRows } = datasetSize()

  await client.unsafe(`DROP TABLE IF EXISTS ${BENCH_TABLE}`)
  // Mirrors the segment table the constant "where" rule targets: the primary key
  // starts with the tenant column, and `id` is unique through its own index.
  await client.unsafe(`
    CREATE TABLE ${BENCH_TABLE} (
      project_id UUID NOT NULL,
      n INT4 NOT NULL,
      id UUID NOT NULL,
      value STRING NOT NULL,
      words_count INT4 NOT NULL,
      PRIMARY KEY (project_id, n),
      UNIQUE INDEX bench_segment_id_key (id)
    )
  `)

  for (let from = 1; from <= largeTenantRows; from += INSERT_CHUNK_ROWS) {
    await insertRows([0, 0], [from, Math.min(from + INSERT_CHUNK_ROWS - 1, largeTenantRows)])
  }

  const tenantsPerChunk = Math.max(1, Math.floor(INSERT_CHUNK_ROWS / smallTenantRows))
  for (let from = 1; from <= smallTenants; from += tenantsPerChunk) {
    await insertRows(
      [from, Math.min(from + tenantsPerChunk - 1, smallTenants)],
      [1, smallTenantRows],
    )
  }

  // Without fresh statistics the planner would be choosing on an empty table.
  await client.unsafe(`CREATE STATISTICS bench_stats FROM ${BENCH_TABLE}`)
})
