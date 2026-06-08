import { join, raw, sqltag as sql } from '@prisma/client/runtime/client'
import type { PrismaClient } from 'db-client/client.ts'
import type { PrismaTransactionClient } from '../transaction/types.ts'
import type { BulkUpdateEntry, PrismaBulkUpdateOptions } from './types.ts'

const JSON_COLUMN_TYPES = new Set<string>(['json', 'jsonb'])

type Column = {
  name: string
  type: string
}

const ENTRIES_LIMIT = 1000

/**
 * Every value (each "where" and each defined "data" cell) becomes one bound
 * placeholder in the `VALUES` list, so the statement uses
 * `entries × (whereColumns + dataColumns)` parameters. PostgreSQL caps a single
 * statement at 65535 bound parameters and CockroachDB has its own ceiling, so we
 * guard the total up front to fail with a clear message instead of an opaque
 * driver error. The effective row cap therefore shrinks as the statement widens.
 */
const BIND_PARAMETERS_LIMIT = 65535

/**
 * Performs a full bulk update operation using Prisma in a single SQL statement.
 * Because it is a single statement, the update is atomic: it either fully applies
 * or fully rolls back, so no surrounding transaction is required. Works on both
 * CockroachDB and PostgreSQL (selected via `options.dbDriver`).
 *
 * The executed query follows the below structure for provided example data:
 * [
 *   { where: { id: 1 }, data: { col1: 11, col2: 12 } },
 *   { where: { id: 2 }, data: { col1: 21, col2: 22 } },
 * ]
 *
 * UPDATE "tbl"
 * SET "col1" = updates."col1", "col2" = updates."col2"
 * FROM (
 *   VALUES
 *     (1, 11, 12),
 *     (2, 21, 22)
 * ) AS updates("id", "col1", "col2")
 * WHERE "tbl"."id" = updates."id"
 *
 * "data" values follow Prisma's convention: an `undefined` value leaves the
 * column untouched (it is dropped from the statement), while `null` sets it to
 * SQL `NULL`. Every entry must specify the same "where" columns and the same set
 * of defined (non-`undefined`) "data" columns.
 *
 * When `options.returning` is provided, the updated rows are returned via a
 * `RETURNING` clause built from it: each entry maps a DB column name to the alias
 * the row should expose (e.g. `content_unit_id` -> `contentUnitId`). Columns are
 * qualified with the target table (e.g. `"translation"."segment"."value"`) to
 * avoid ambiguity with the `updates` source. Without it the statement runs as a
 * plain update and an empty array is returned.
 *
 * @template T - The shape of each row returned via `options.returning`.
 * @template P - The concrete Prisma client type, inferred from `prisma` so that both
 *   a full client and its derived transaction client (`PrismaTransactionClient<P>`) are accepted.
 * @param prisma - The Prisma client instance (or a transaction client, e.g. inside `prismaTransaction`).
 * @param tableName - The name of the table to update (may be schema-qualified, e.g. `translation.segment`).
 * @param options - `dbDriver`, the `typeByColumn` map (must map every "where" column and every
 *   "data" column that has a defined value), and an optional `returning` map.
 * @param entries - The entries containing the match condition and column values for the update.
 * @returns The updated rows (aliased per `options.returning`), or an empty array when it is omitted.
 */
export const prismaBulkUpdate = <T = unknown, P extends PrismaClient = PrismaClient>(
  prisma: P | PrismaTransactionClient<P>,
  tableName: string,
  options: PrismaBulkUpdateOptions,
  entries: BulkUpdateEntry[],
): Promise<T[]> => {
  const { typeByColumn, returning } = options

  const [firstEntry] = entries

  if (!firstEntry) {
    throw new Error('Entries array must not be empty')
  }
  if (entries.length > ENTRIES_LIMIT) {
    throw new Error(`Entries array length must not exceed ${ENTRIES_LIMIT}`)
  }

  const whereColumns = resolveColumns(typeByColumn, Object.keys(firstEntry.where))
  const dataColumns = resolveColumns(typeByColumn, definedColumnNames(firstEntry.data))

  if (whereColumns.length === 0) {
    throw new Error('Entry "where" object must not be empty')
  }
  if (dataColumns.length === 0) {
    throw new Error('Entry "data" object must not be empty')
  }

  const bindParametersCount = entries.length * (whereColumns.length + dataColumns.length)
  if (bindParametersCount > BIND_PARAMETERS_LIMIT) {
    throw new Error(
      `Bulk update would use ${bindParametersCount} bind parameters ` +
        `(${entries.length} entries × ${whereColumns.length + dataColumns.length} columns), ` +
        `exceeding the limit of ${BIND_PARAMETERS_LIMIT}`,
    )
  }

  // Quote each part of a (possibly schema-qualified) table name separately,
  // so that "translation.segment" becomes "translation"."segment" rather than a
  // single identifier named "translation.segment".
  const quotedTableName = tableName
    .split('.')
    .map((part) => `"${part}"`)
    .join('.')

  const sqlSetExpressions = dataColumns.map((column) => {
    return sql([`"${column.name}" = updates."${column.name}"::${column.type}`])
  })

  const sqlValuesExpressions = entries.map((entry) =>
    prepareSqlValuesExpression(entry, whereColumns, dataColumns),
  )

  const sqlValuesColumnAliases = [...whereColumns, ...dataColumns].map((column) => {
    return sql([`"${column.name}"`])
  })

  const sqlWhereConditions = whereColumns.map((column) => {
    return sql([`${quotedTableName}."${column.name}" = updates."${column.name}"::${column.type}`])
  })

  const updateStatement = sql`
    UPDATE ${sql([quotedTableName])}
    SET ${join(sqlSetExpressions, ', ')}
    FROM (
        VALUES ${join(sqlValuesExpressions, ',\n')}
    ) AS updates(${join(sqlValuesColumnAliases, ', ')})
    WHERE ${join(sqlWhereConditions, ' AND ')}
  `

  if (!returning || Object.keys(returning).length === 0) {
    return prisma.$executeRaw(updateStatement).then(() => [])
  }

  const sqlReturningExpressions = Object.entries(returning).map(([column, alias]) => {
    return sql([`${quotedTableName}."${column}" AS "${alias}"`])
  })

  return prisma.$queryRaw<T[]>(
    sql`${updateStatement} RETURNING ${join(sqlReturningExpressions, ', ')}`,
  )
}

/**
 * Builds the parenthesized `(where..., set...)` tuple for a single entry — one
 * row of the `VALUES` source. The entry must supply exactly the given `where`
 * columns and the same set of defined `data` columns (the shape established by
 * the first entry); a mismatch throws so the generated `VALUES` list stays
 * rectangular and aligned with the column aliases.
 */
const prepareSqlValuesExpression = (
  entry: BulkUpdateEntry,
  whereColumns: Column[],
  dataColumns: Column[],
) => {
  if (whereColumns.length !== Object.keys(entry.where).length) {
    throw new Error('Entry "where" columns are not the same')
  }

  const sqlWhereValues = whereColumns.map((whereConditionColumn) => {
    const whereConditionValue = entry.where[whereConditionColumn.name]

    if (whereConditionValue === undefined) {
      throw new Error(`Entry "where" column "${whereConditionColumn.name}" was not found`)
    }

    return renderTypedValue(whereConditionValue, whereConditionColumn.type)
  })

  if (dataColumns.length !== definedColumnNames(entry.data).length) {
    throw new Error('Entry "data" columns are not the same')
  }

  const sqlSetValues = dataColumns.map((setExpressionColumn) => {
    const setExpressionValue = entry.data[setExpressionColumn.name]

    if (setExpressionValue === undefined) {
      throw new Error(`Entry "data" column "${setExpressionColumn.name}" was not found`)
    }

    return renderTypedValue(setExpressionValue, setExpressionColumn.type)
  })

  return sql`(${join(sqlWhereValues, ',')},${join(sqlSetValues, ',')})`
}

/**
 * Pairs each requested column name with its SQL type from `typeByColumn`,
 * throwing when a column has no type mapping (it would otherwise produce an
 * uncasted, ambiguous placeholder).
 */
const resolveColumns = (typeByColumn: Record<string, string>, columnNames: string[]): Column[] =>
  columnNames.map((columnName) => {
    const type = typeByColumn[columnName]

    if (!type) {
      throw new Error(`Column type mapping is missing for "${columnName}"`)
    }

    return { name: columnName, type }
  })

/**
 * `data` follows Prisma's convention: an `undefined` value means "leave the
 * column untouched", so such keys are dropped from the statement (a `null` value
 * is kept and becomes a SQL `NULL`). `where` columns are never dropped — they form
 * the match condition.
 */
const definedColumnNames = (columnRecord: Record<string, unknown>): string[] =>
  Object.keys(columnRecord).filter((columnName) => columnRecord[columnName] !== undefined)

/**
 * Renders a single value as a typed SQL placeholder (e.g. `$1::uuid`).
 *
 * The explicit `::type` cast is required by CockroachDB, which (unlike
 * PostgreSQL) refuses to infer the data type of an untyped placeholder inside a
 * `VALUES` list ("could not determine data type of placeholder"). The cast is
 * also valid PostgreSQL, so the same statement runs on both drivers.
 *
 * Whether a value is JSON-serialized is decided by the column type, not the
 * runtime value: `json`/`jsonb` columns get the value stringified, everything
 * else is bound directly (Prisma binds `Date`, numbers, etc. natively). A `null`
 * is always bound directly so it becomes a SQL `NULL` rather than a JSON `null`.
 */
const renderTypedValue = (value: unknown, type: string) =>
  value !== null && JSON_COLUMN_TYPES.has(type)
    ? sql`${JSON.stringify(value)}::${raw(type)}`
    : sql`${value}::${raw(type)}`
