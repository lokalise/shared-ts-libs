import { snapshotMysql } from './mysql.ts'
import { snapshotPostgres } from './postgres.ts'
import { DEFAULT_EXCLUDE_TABLES, isPgLike } from './shared.ts'
import type { SchemaSnapshot, SnapshotSchemaOptions } from './types.ts'

/**
 * Captures a structural snapshot of a live database schema by querying its system catalogs.
 *
 * Designed for the Prisma → Drizzle (or any cross-ORM) migration use case:
 * after generating Drizzle migrations and running them against a fresh database, compare
 * the result against a snapshot of the original Prisma-built database. Any difference is
 * a real defect in the Drizzle schema definition (typically a missing explicit name
 * override on a constraint or index) that would cause `markMigrationsApplied` to record
 * a baseline that doesn't actually match the production schema.
 *
 * The snapshot is intentionally strict — names are part of the schema and are not
 * normalized away. Column ordering is the only thing not enforced (columns are keyed
 * by name, not by ordinal position).
 *
 * Supported dialects: PostgreSQL, MySQL, CockroachDB (uses the PostgreSQL path).
 */
export function snapshotSchema(options: SnapshotSchemaOptions): Promise<SchemaSnapshot> {
  const { executor, dialect } = options
  const excludeTables = new Set(options.excludeTables ?? DEFAULT_EXCLUDE_TABLES)

  if (isPgLike(dialect)) {
    const schemas = options.schemas && options.schemas.length > 0 ? options.schemas : ['public']
    return snapshotPostgres(executor, schemas, excludeTables, dialect)
  }

  if (dialect === 'mysql') {
    return snapshotMysql(executor, options.schemas, excludeTables)
  }

  return Promise.reject(new Error(`Unsupported dialect for snapshotSchema: "${dialect}"`))
}
