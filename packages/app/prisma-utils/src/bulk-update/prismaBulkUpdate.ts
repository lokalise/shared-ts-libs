import { join, raw, sqltag as sql } from '@prisma/client/runtime/client'
import type { PrismaClient } from 'db-client/client.ts'
import type { PrismaTransactionClient } from '../transaction/types.ts'
import type { BulkUpdateEntry, PrismaBulkUpdateOptions } from './types.ts'

const JSON_COLUMN_TYPES = new Set<string>(['json', 'jsonb'])

// `typeof` results for which `a === b` guarantees both bind to the same SQL value.
const COMPARABLE_VALUE_TYPES = new Set<string>(['string', 'number', 'boolean', 'bigint'])

type Column = {
  name: string
  type: string
}

const ENTRIES_LIMIT = 1000

/**
 * Every "data" cell and every "where" cell in the `VALUES` list is one bound
 * placeholder, and each constant "where" predicate adds one more, so the
 * statement uses `entries × (valuesWhereColumns + dataColumns) + constantWhereColumns`
 * parameters. PostgreSQL caps a single statement at 65535 bound parameters and
 * CockroachDB has its own ceiling, so we guard the total up front to fail with a
 * clear message instead of an opaque driver error.
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
 *   { where: { tenant_id: 7, id: 1 }, data: { col1: 11, col2: 12 } },
 *   { where: { tenant_id: 7, id: 2 }, data: { col1: 21, col2: 22 } },
 * ]
 *
 * UPDATE "tbl"
 * SET "col1" = updates."col1"::int4, "col2" = updates."col2"::int4
 * FROM (
 *   VALUES
 *     ($1::int4, $2::int4, $3::int4),
 *     ($4::int4, $5::int4, $6::int4)
 * ) AS updates("id", "col1", "col2")
 * WHERE "tbl"."tenant_id" = $7::int4 AND "tbl"."id" = updates."id"::int4
 *
 * A "where" column whose value is the same on every entry (`tenant_id` above) is
 * emitted as a constant predicate instead of a `VALUES` column. Joining a tenant
 * column from `VALUES` lets CockroachDB plan a lookup join on a primary key that
 * starts with it and read every row of the tenant; a constant lets it use the
 * index on the other key. A value counts as the same only when it is a string,
 * number, boolean or bigint and is `===` to the first entry's value, and the
 * column is not `json`/`jsonb`. Anything else (`null`, `Date`, `Buffer`, objects)
 * stays in `VALUES`. When several entries share every "where" value, the first
 * "where" column stays in `VALUES` so the source is still keyed on the target
 * rows. A single entry has every eligible "where" column emitted as a constant.
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
 * avoid ambiguity with the `updates` source. Without it (or with an empty map)
 * the statement runs as a plain update and an empty array is returned.
 *
 * Note on identifiers: `tableName`, the column names (`typeByColumn` keys and the
 * `where`/`data` keys), the column `type`s, and the `returning` keys/aliases are
 * interpolated into the SQL as raw identifiers — only the row *values* are bound
 * as parameters. These must therefore be trusted, static configuration, never
 * end-user input: a name containing a `"` would break out of its quoted
 * identifier, and any string assigned to a `(string & {})` column type reaches
 * the SQL verbatim.
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

  const undefinedWhereColumn = Object.keys(firstEntry.where).find(
    (columnName) => firstEntry.where[columnName] === undefined,
  )
  if (undefinedWhereColumn) {
    throw new Error(`Entry "where" column "${undefinedWhereColumn}" must not be undefined`)
  }

  // A column appearing in both "where" and "data" would be emitted twice in the
  // `updates(...)` alias list, producing an invalid derived-table column list.
  const overlappingColumn = dataColumns.find((dataColumn) =>
    whereColumns.some((whereColumn) => whereColumn.name === dataColumn.name),
  )
  if (overlappingColumn) {
    throw new Error(`Column "${overlappingColumn.name}" must not appear in both "where" and "data"`)
  }

  const constantWhereColumns = resolveConstantWhereColumns(whereColumns, entries)
  const valuesWhereColumns = whereColumns.filter((column) => !constantWhereColumns.has(column))
  const valuesColumns = [...valuesWhereColumns, ...dataColumns]

  const bindParametersCount = entries.length * valuesColumns.length + constantWhereColumns.size
  if (bindParametersCount > BIND_PARAMETERS_LIMIT) {
    const constantsBreakdown =
      constantWhereColumns.size > 0 ? ` + ${constantWhereColumns.size} constant "where" values` : ''
    throw new Error(
      `Bulk update would use ${bindParametersCount} bind parameters ` +
        `(${entries.length} entries × ${valuesColumns.length} columns${constantsBreakdown}), ` +
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

  const sqlValuesExpressions = entries.map((entry, index) =>
    prepareSqlValuesExpression(entry, index, whereColumns, valuesWhereColumns, dataColumns),
  )

  const sqlValuesColumnAliases = valuesColumns.map((column) => {
    return sql([`"${column.name}"`])
  })

  const sqlWhereConditions = whereColumns.map((column) => {
    const qualifiedColumn = `${quotedTableName}."${column.name}"`
    return constantWhereColumns.has(column)
      ? sql`${raw(qualifiedColumn)} = ${renderTypedValue(firstEntry.where[column.name], column.type)}`
      : sql([`${qualifiedColumn} = updates."${column.name}"::${column.type}`])
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
 * Builds the parenthesized `(where..., set...)` tuple for a single entry: one row
 * of the `VALUES` source, holding the `valuesWhereColumns` subset of the "where"
 * columns. The entry must supply exactly the given `where` columns and the same
 * set of defined `data` columns (the shape established by the first entry); a
 * mismatch throws so the generated `VALUES` list stays rectangular and aligned
 * with the column aliases.
 */
const prepareSqlValuesExpression = (
  entry: BulkUpdateEntry,
  index: number,
  whereColumns: Column[],
  valuesWhereColumns: Column[],
  dataColumns: Column[],
) => {
  if (whereColumns.length !== Object.keys(entry.where).length) {
    throw new Error(`Entry "where" columns are not the same (at index ${index})`)
  }

  const missingWhereColumn = whereColumns.find((column) => entry.where[column.name] === undefined)
  if (missingWhereColumn) {
    throw new Error(
      `Entry "where" column "${missingWhereColumn.name}" was not found (at index ${index})`,
    )
  }

  const sqlWhereValues = valuesWhereColumns.map((column) =>
    renderTypedValue(entry.where[column.name], column.type),
  )

  if (dataColumns.length !== definedColumnNames(entry.data).length) {
    throw new Error(`Entry "data" columns are not the same (at index ${index})`)
  }

  const sqlSetValues = dataColumns.map((setExpressionColumn) => {
    const setExpressionValue = entry.data[setExpressionColumn.name]

    if (setExpressionValue === undefined) {
      throw new Error(
        `Entry "data" column "${setExpressionColumn.name}" was not found (at index ${index})`,
      )
    }

    return renderTypedValue(setExpressionValue, setExpressionColumn.type)
  })

  return sql`(${join([...sqlWhereValues, ...sqlSetValues], ',')})`
}

/**
 * Picks the "where" columns to emit as constant predicates, following the rule in
 * the `prismaBulkUpdate` docblock.
 */
const resolveConstantWhereColumns = (
  whereColumns: Column[],
  entries: BulkUpdateEntry[],
): Set<Column> => {
  const constantColumns = new Set(
    whereColumns.filter((column) => {
      if (JSON_COLUMN_TYPES.has(column.type)) {
        return false
      }
      const firstValue = entries[0]?.where[column.name]
      return (
        COMPARABLE_VALUE_TYPES.has(typeof firstValue) &&
        entries.every((entry) => entry.where[column.name] === firstValue)
      )
    }),
  )

  const [firstWhereColumn] = whereColumns
  if (entries.length > 1 && firstWhereColumn && constantColumns.size === whereColumns.length) {
    constantColumns.delete(firstWhereColumn)
  }

  return constantColumns
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
