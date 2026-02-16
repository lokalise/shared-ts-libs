import { getTableColumns, sql, is } from 'drizzle-orm'
import { getTableConfig, type PgTable, type PgUpdateSetSource, PgEnumColumn } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

type Column = {
  key: string // key from table object
  name: string // SQL column name
  type: string // SQL column type
}

export type BulkUpdateEntry<T> = {
  where: T
  data: T
}

const getColumns = (table: PgTable, columnNames: string[]): Column[] => {
  const tableColumns = getTableColumns(table)

  return columnNames.map((columnName) => {
    const tableColumn = tableColumns[columnName]

    if (!tableColumn) {
      throw new Error(`Column "${columnName}" could not be mapped to table`)
    }

    const type =
        is(tableColumn, PgEnumColumn)
        ? `"${tableColumn.enum.schema ?? 'public'}".${tableColumn.enum.enumName}`
        : tableColumn.getSQLType()

    return { key: columnName, name: tableColumn.name, type }
  })
}

const prepareSqlValuesExpressions = (
  whereColumns: Column[],
  dataColumns: Column[],
  entries: BulkUpdateEntry<Record<string, unknown>>[],
) => {
  return entries.map((entry) => {
    if (whereColumns.length !== Object.keys(entry.where).length) {
      throw new Error(
        `Mismatch in 'where' columns. Expected [${whereColumns.map((c) => c.name)}], got [${Object.keys(entry.where)}]`,
      )
    }

    const sqlWhereValues = whereColumns.map((whereConditionColumn) => {
      const whereConditionValue = entry.where[whereConditionColumn.key]

      if (whereConditionValue === undefined) {
        throw new Error(
          `Mismatch in 'where' columns. Expected [${whereColumns.map((c) => c.key)}], got [${Object.keys(entry.where)}]`,
        )
      }

      return sql`${whereConditionValue}::${sql.raw(whereConditionColumn.type)}`
    })

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

      if (
        Array.isArray(setExpressionValue) ||
        (typeof setExpressionValue === 'object' && setExpressionValue !== null)
      ) {
        return sql`${JSON.stringify(setExpressionValue)}::${sql.raw(setExpressionColumn.type)}`
      }

      return sql`${setExpressionValue}::${sql.raw(setExpressionColumn.type)}`
    })

    return sql`(${sql.join(sqlWhereValues, sql.raw(','))},${sql.join(sqlSetValues, sql.raw(','))})`
  })
}

/**
 * Performs a full bulk update operation using Drizzle.
 * Example input:
 * [
 *   { where: { id: 1 }, data: { col1: 11, col2: 12 } },
 *   { where: { id: 2 }, data: { col1: 21, col2: 22 } },
 * ]
 *
 * Generates a query of the form:
 * ```sql
 * UPDATE "some_table" AS tbl
 * SET "col1" = updates."col1", "col2" = updates."col2"
 * FROM (
 *   VALUES
 *     (11, 12, 1),
 *     (21, 22, 2)
 * ) AS updates("id", "col1", "col2")
 * WHERE tbl."id" = updates."id"
 * ```
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

  const sqlValuesExpressions = prepareSqlValuesExpressions(whereColumns, dataColumns, entries)

  const sqlValuesColumnAliases = [...whereColumns, ...dataColumns].map((column) => {
    return sql.raw(`"${column.name}"`)
  })

  const sqlWhereConditions = whereColumns.map((column) => {
    return sql.raw(`tbl."${column.name}" = updates."${column.name}"::${column.type}`)
  })

  await drizzle.execute(sql`UPDATE ${sql.raw(`"${tableSchema}"."${tableName}"`)} AS tbl
SET ${sql.join(sqlSetExpressions, sql.raw(', '))}
FROM (
VALUES
${sql.join(sqlValuesExpressions, sql.raw(',\n'))}
) AS updates(${sql.join(sqlValuesColumnAliases, sql.raw(', '))})
WHERE ${sql.join(sqlWhereConditions, sql.raw(' AND '))}`)
}
