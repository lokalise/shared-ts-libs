import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from 'db-client/client.ts'
import { type DbDriver, DbDriverEnum } from '../src/types.ts'
import { getDatasourceUrl } from '../test/getDatasourceUrl.ts'

export const BENCH_TABLE = 'bench_segment'

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

export const createBenchClient = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatasourceUrl() }) })

// The seed and the benchmark run against either database; `DATABASE_URL` picks which.
export const detectDbDriver = async (prisma: PrismaClient): Promise<DbDriver> => {
  const [{ version } = { version: '' }] = await prisma.$queryRawUnsafe<{ version: string }[]>(
    'SELECT version() AS version',
  )
  return version.includes('CockroachDB') ? DbDriverEnum.COCKROACH_DB : DbDriverEnum.POSTGRES
}
