import type { DbDriverEnum } from '../types.ts'

/**
 * One row of a bulk update: `where` identifies the row(s) to match and `data`
 * holds the new column values. An `undefined` value in `data` follows Prisma's
 * convention and leaves that column untouched; `null` sets a SQL NULL.
 */
export type BulkUpdateEntry = {
  where: Record<string, unknown>
  data: Record<string, unknown>
}

/**
 * SQL type names shared by CockroachDB and PostgreSQL, used to render the
 * explicit `::type` cast on every bound value.
 */
type CommonColumnSqlType =
  | 'uuid'
  | 'text'
  | 'bool'
  | 'int2'
  | 'int4'
  | 'int8'
  | 'float4'
  | 'float8'
  | 'numeric'
  | 'date'
  | 'timestamptz'
  | 'json'
  | 'jsonb'

/**
 * The literal union provides autocomplete for the common types, while the
 * `(string & {})` member keeps any other type assignable — e.g. schema-qualified
 * enums like `translation.segment_status`.
 */
export type CockroachDbColumnSqlType = CommonColumnSqlType | 'bytes' | (string & {})
export type PostgresColumnSqlType = CommonColumnSqlType | 'bytea' | 'varchar' | (string & {})

/**
 * Options for `prismaBulkUpdate`. `dbDriver` selects which column-type
 * vocabulary `typeByColumn` autocompletes; the emitted SQL is identical for both.
 * `typeByColumn` must map every `where` column and every defined `data` column.
 */
export type PrismaBulkUpdateOptions = {
  /**
   * Optional map of DB column name to the result alias to expose via a
   * `RETURNING` clause. When omitted, no rows are returned.
   */
  returning?: Record<string, string>
} & (
  | {
      dbDriver: typeof DbDriverEnum.COCKROACH_DB
      typeByColumn: Record<string, CockroachDbColumnSqlType>
    }
  | { dbDriver: typeof DbDriverEnum.POSTGRES; typeByColumn: Record<string, PostgresColumnSqlType> }
)
