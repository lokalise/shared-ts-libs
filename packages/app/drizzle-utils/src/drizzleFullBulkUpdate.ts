import { getTableColumns, is, sql } from 'drizzle-orm'
import {
  getTableConfig,
  PgEnumColumn,
  PgEnumObjectColumn,
  type PgTable,
  type PgUpdateSetSource,
} from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

type Column = {
  key: string // key from table object
  name: string // SQL column name
  type: string // SQL column type
}

// `typeof` results for which `a === b` guarantees both bind to the same SQL value.
const COMPARABLE_VALUE_TYPES = new Set<string>(['string', 'number', 'boolean', 'bigint'])

export type BulkUpdateEntry<T> = {
  where: T
  data: T
}

// Serializes a single value into a `<value>::<type>` SQL fragment.
// - json/jsonb: must be stringified so Postgres parses it as a JSON literal.
// - Date: must be converted to an ISO-8601 string; a raw Date bound parameter
//   is rejected on the explicit-cast VALUES path. ISO strings cast cleanly to
//   timestamp / timestamptz / date / time.
const toSqlCastValue = (value: unknown, type: string) => {
  if (type === 'json' || type === 'jsonb') {
    return sql`${JSON.stringify(value)}::${sql.raw(type)}`
  }

  if (value instanceof Date) {
    return sql`${value.toISOString()}::${sql.raw(type)}`
  }

  return sql`${value}::${sql.raw(type)}`
}

const getColumns = (table: PgTable, columnNames: string[]): Column[] => {
  const tableColumns = getTableColumns(table)

  return columnNames.map((columnName) => {
    const tableColumn = tableColumns[columnName]

    if (!tableColumn) {
      throw new Error(`Column "${columnName}" could not be mapped to table`)
    }

    const type =
      is(tableColumn, PgEnumColumn) || is(tableColumn, PgEnumObjectColumn)
        ? `"${tableColumn.enum.schema ?? 'public'}".${tableColumn.enum.enumName}`
        : tableColumn.getSQLType()

    return { key: columnName, name: tableColumn.name, type }
  })
}

const prepareSqlValuesExpressions = (
  whereColumns: Column[],
  valuesWhereColumns: Column[],
  dataColumns: Column[],
  entries: BulkUpdateEntry<Record<string, unknown>>[],
) => {
  return entries.map((entry) => {
    if (whereColumns.length !== Object.keys(entry.where).length) {
      throw new Error(
        `Mismatch in 'where' columns. Expected [${whereColumns.map((c) => c.name)}], got [${Object.keys(entry.where)}]`,
      )
    }

    if (whereColumns.some((column) => entry.where[column.key] === undefined)) {
      throw new Error(
        `Mismatch in 'where' columns. Expected [${whereColumns.map((c) => c.key)}], got [${Object.keys(entry.where)}]`,
      )
    }

    const sqlWhereValues = valuesWhereColumns.map((column) =>
      toSqlCastValue(entry.where[column.key], column.type),
    )

    if (dataColumns.length !== Object.keys(entry.data).length) {
      throw new Error(
        `Mismatch in 'data' columns. Expected [${dataColumns.map((c) => c.key)}], got [${Object.keys(entry.data)}]`,
      )
    }

    const sqlSetValues = dataColumns.map((setExpressionColumn) => {
      const setExpressionValue = entry.data[setExpressionColumn.key]

      if (setExpressionValue === undefined) {
        throw new Error(
          `Mismatch in 'data' columns. Expected [${dataColumns.map((c) => c.key)}], got [${Object.keys(entry.data)}]`,
        )
      }

      return toSqlCastValue(setExpressionValue, setExpressionColumn.type)
    })

    return sql`(${sql.join([...sqlWhereValues, ...sqlSetValues], sql.raw(','))})`
  })
}

/**
 * Picks the "where" columns to emit as constant predicates, following the rule in
 * the `drizzleFullBulkUpdate` docblock.
 */
const resolveConstantWhereColumns = (
  whereColumns: Column[],
  entries: BulkUpdateEntry<Record<string, unknown>>[],
): Set<Column> =>
  new Set(
    whereColumns.filter((column) => {
      const firstValue = entries[0]?.where[column.key]
      return (
        COMPARABLE_VALUE_TYPES.has(typeof firstValue) &&
        entries.every((entry) => entry.where[column.key] === firstValue)
      )
    }),
  )

/**
 * Performs a full bulk update operation using Drizzle.
 * Example input:
 * [
 *   { where: { tenant_id: 7, id: 1 }, data: { col1: 11, col2: 12 } },
 *   { where: { tenant_id: 7, id: 2 }, data: { col1: 21, col2: 22 } },
 * ]
 *
 * Generates a query of the form:
 * ```sql
 * UPDATE "public"."some_table" AS tbl
 * SET "col1" = updates."col1"::smallint, "col2" = updates."col2"::smallint
 * FROM (
 *   VALUES
 *     ($1::smallint, $2::smallint, $3::smallint),
 *     ($4::smallint, $5::smallint, $6::smallint)
 * ) AS updates("id", "col1", "col2")
 * WHERE tbl."tenant_id" = $7::smallint AND tbl."id" = updates."id"::smallint
 * ```
 *
 * A "where" column whose value is the same on every entry (`tenant_id` above) is
 * emitted as a constant predicate instead of a `VALUES` column. Joining a tenant
 * column from `VALUES` lets CockroachDB plan a lookup join on a primary key that
 * starts with it and read every row of the tenant; a constant lets it use the
 * index on the other key. A value counts as the same only when it is a string,
 * number, boolean or bigint and is `===` to the first entry's value. Anything else
 * (`null`, `Date`, objects) stays in `VALUES`. A `null` "where" value matches no
 * row either way, because `=` is never true for NULL; matching it with `IS NULL`
 * would change results. When every "where" column is constant, `VALUES` holds
 * only the "data" columns.
 *
 * Notes:
 * - All `where` objects must have the same set of keys.
 * - All `data` objects must have the same set of keys.
 *
 * @template TTable - The Drizzle table type.
 * @param {PostgresJsDatabase} drizzle - The Drizzle database instance.
 * @param {TTable} table - The table to perform updates on.
 * @param {BulkUpdateEntry<PgUpdateSetSource<TTable>>[]} entries - Array of update instructions.
 *   Each entry specifies a `where` condition (typically the PK) and the `data` values to set.
 * @returns {Promise<void>} Resolves when the bulk update completes.
 */
export const drizzleFullBulkUpdate = async <TTable extends PgTable>(
  drizzle: PostgresJsDatabase,
  table: TTable,
  entries: BulkUpdateEntry<PgUpdateSetSource<TTable>>[],
): Promise<void> => {
  const firstEntry = entries.at(0)

  if (!firstEntry) {
    throw new Error('Entries array must not be empty')
  }

  const tableConfig = getTableConfig(table)
  const tableSchema = tableConfig.schema ?? 'public'
  const tableName = tableConfig.name

  const whereColumns = getColumns(table, Object.keys(firstEntry.where))
  const dataColumns = getColumns(table, Object.keys(firstEntry.data))

  if (whereColumns.length === 0) {
    throw new Error('Entry "where" object must not be empty')
  }
  if (dataColumns.length === 0) {
    throw new Error('Entry "data" object must not be empty')
  }

  const sqlSetExpressions = dataColumns.map((column) => {
    return sql.raw(`"${column.name}" = updates."${column.name}"::${column.type}`)
  })

  const constantWhereColumns = resolveConstantWhereColumns(whereColumns, entries)
  const valuesWhereColumns = whereColumns.filter((column) => !constantWhereColumns.has(column))

  const sqlValuesExpressions = prepareSqlValuesExpressions(
    whereColumns,
    valuesWhereColumns,
    dataColumns,
    entries,
  )

  const sqlValuesColumnAliases = [...valuesWhereColumns, ...dataColumns].map((column) => {
    return sql.raw(`"${column.name}"`)
  })

  const sqlWhereConditions = whereColumns.map((column) => {
    return constantWhereColumns.has(column)
      ? sql`${sql.raw(`tbl."${column.name}"`)} = ${toSqlCastValue(firstEntry.where[column.key as keyof typeof firstEntry.where], column.type)}`
      : sql.raw(`tbl."${column.name}" = updates."${column.name}"::${column.type}`)
  })

  await drizzle.execute(sql`UPDATE ${sql.raw(`"${tableSchema}"."${tableName}"`)} AS tbl
SET ${sql.join(sqlSetExpressions, sql.raw(', '))}
FROM (
VALUES
${sql.join(sqlValuesExpressions, sql.raw(',\n'))}
) AS updates(${sql.join(sqlValuesColumnAliases, sql.raw(', '))})
WHERE ${sql.join(sqlWhereConditions, sql.raw(' AND '))}`)
}
