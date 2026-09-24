import { afterAll, beforeAll, bench, describe } from 'vitest'
import { drizzleFullBulkUpdate } from '../src/drizzleFullBulkUpdate.ts'
import { BENCH_TABLE, benchSegment, createBenchClient, tenantIdSql } from './benchDataset.ts'

const BATCH_SIZES = [2, 100, 1000] as const

type TargetRow = { project_id: string; id: string }

const { client, db } = createBenchClient()
const targetsByBatchSize = new Map<number, TargetRow[]>()
let iteration = 0

// Spreads the targets over the whole large tenant rather than its first rows.
const loadTargets = async (batchSize: number): Promise<TargetRow[]> => {
  const [{ rows } = { rows: '0' }] = await client.unsafe<{ rows: string }[]>(
    `SELECT count(*) AS rows FROM ${BENCH_TABLE} WHERE project_id = ${tenantIdSql(0)}`,
  )
  const step = Math.floor(Number(rows) / batchSize)
  if (step < 1) {
    throw new Error(`Tenant 0 has ${rows} rows, fewer than a batch of ${batchSize}; run bench:seed`)
  }
  return client.unsafe<TargetRow[]>(
    `SELECT project_id::text AS project_id, id::text AS id
     FROM ${BENCH_TABLE}
     WHERE project_id = ${tenantIdSql(0)} AND n IN (SELECT generate_series(1, ${batchSize}) * ${step})`,
  )
}

const targets = (batchSize: number) => {
  const rows = targetsByBatchSize.get(batchSize)
  if (!rows) throw new Error(`No targets loaded for a batch of ${batchSize}`)
  return rows
}

beforeAll(async () => {
  for (const batchSize of BATCH_SIZES) {
    targetsByBatchSize.set(batchSize, await loadTargets(batchSize))
  }
})

afterAll(async () => {
  await client.end()
})

for (const batchSize of BATCH_SIZES) {
  describe(`update ${batchSize} rows of the large tenant`, () => {
    bench(
      'where { project_id, id }',
      async () => {
        iteration++
        await drizzleFullBulkUpdate(
          db,
          benchSegment,
          targets(batchSize).map((row) => ({
            where: { project_id: row.project_id, id: row.id },
            data: { value: `bench-${iteration}`, words_count: iteration },
          })),
        )
      },
      { time: 10_000, iterations: 5, warmupIterations: 1 },
    )
  })
}
