import type { SqlExecutor } from '../markMigrationsApplied.ts'
import {
  asBool,
  asNullableString,
  asString,
  emptySchemaContents,
  ensureTable,
  normalizeAction,
  quoteMysqlLiteralList,
} from './shared.ts'
import type { ColumnSnapshot, ForeignKeyAction, SchemaSnapshot, TableSnapshot } from './types.ts'

export async function snapshotMysql(
  executor: SqlExecutor,
  schemas: string[] | undefined,
  excludeTables: Set<string>,
): Promise<SchemaSnapshot> {
  const schemaList = await resolveMysqlSchemaList(executor, schemas)

  const snapshot: SchemaSnapshot = { dialect: 'mysql', schemas: {} }
  for (const schema of schemaList) {
    snapshot.schemas[schema] = emptySchemaContents()
  }

  const schemasIn = quoteMysqlLiteralList(schemaList)
  const excludeIn = excludeTables.size > 0 ? quoteMysqlLiteralList([...excludeTables]) : "''"

  await loadMysqlTables(executor, snapshot, schemasIn, excludeIn)
  await loadMysqlColumns(executor, snapshot, schemasIn, excludeIn)
  await loadMysqlIndexesAndKeys(executor, snapshot, schemasIn, excludeIn)
  await loadMysqlForeignKeys(executor, snapshot, schemasIn, excludeIn)
  await loadMysqlCheckConstraints(executor, snapshot, schemasIn, excludeIn)

  return snapshot
}

async function resolveMysqlSchemaList(
  executor: SqlExecutor,
  schemas: string[] | undefined,
): Promise<string[]> {
  if (schemas && schemas.length > 0) return schemas
  const dbRow = await executor.all('SELECT DATABASE() AS db')
  const db = asString(dbRow[0]?.db)
  if (!db) {
    throw new Error(
      'snapshotSchema: MySQL connection has no current database — pass `schemas` explicitly',
    )
  }
  return [db]
}

async function loadMysqlTables(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemasIn: string,
  excludeIn: string,
): Promise<void> {
  const tables = await executor.all(
    `SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN (${schemasIn})
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN (${excludeIn})
      ORDER BY table_schema, table_name`,
  )
  for (const row of tables) {
    const schema = asString(row.table_schema ?? row.TABLE_SCHEMA)
    const name = asString(row.table_name ?? row.TABLE_NAME)
    const contents = snapshot.schemas[schema]
    if (!contents) continue
    ensureTable(contents, name)
  }
}

async function loadMysqlColumns(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemasIn: string,
  excludeIn: string,
): Promise<void> {
  const columns = await executor.all(
    `SELECT
        table_schema,
        table_name,
        column_name,
        column_type,
        is_nullable,
        column_default,
        extra,
        generation_expression
      FROM information_schema.columns
      WHERE table_schema IN (${schemasIn})
        AND table_name NOT IN (${excludeIn})
      ORDER BY table_schema, table_name, ordinal_position`,
  )
  for (const row of columns) {
    const schema = asString(row.table_schema ?? row.TABLE_SCHEMA)
    const tableName = asString(row.table_name ?? row.TABLE_NAME)
    const contents = snapshot.schemas[schema]
    if (!contents) continue
    const table = contents.tables[tableName]
    if (!table) continue
    table.columns[asString(row.column_name ?? row.COLUMN_NAME)] = buildMysqlColumn(row)
  }
}

function buildMysqlColumn(row: Record<string, unknown>): ColumnSnapshot {
  const generationExpr = asNullableString(row.generation_expression ?? row.GENERATION_EXPRESSION)
  return {
    type: asString(row.column_type ?? row.COLUMN_TYPE),
    nullable: asString(row.is_nullable ?? row.IS_NULLABLE).toUpperCase() === 'YES',
    default: asNullableString(row.column_default ?? row.COLUMN_DEFAULT),
    identity: null,
    extra: asString(row.extra ?? row.EXTRA),
    generated: generationExpr && generationExpr.length > 0 ? generationExpr : null,
  }
}

interface MysqlIndexAggregate {
  unique: boolean
  method: string
  columns: { seq: number; name: string }[]
}

async function loadMysqlIndexesAndKeys(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemasIn: string,
  excludeIn: string,
): Promise<void> {
  const indexRows = await executor.all(
    `SELECT
        table_schema,
        table_name,
        index_name,
        non_unique,
        index_type,
        seq_in_index,
        column_name
      FROM information_schema.statistics
      WHERE table_schema IN (${schemasIn})
        AND table_name NOT IN (${excludeIn})
      ORDER BY table_schema, table_name, index_name, seq_in_index`,
  )

  const indexAccum = new Map<string, MysqlIndexAggregate>()
  for (const row of indexRows) {
    accumulateMysqlIndexRow(row, indexAccum)
  }

  for (const [key, agg] of indexAccum) {
    const [schema, tableName, indexName] = splitKey3(key)
    const table = snapshot.schemas[schema]?.tables[tableName]
    if (!table) continue
    applyMysqlIndexAggregate(table, indexName, agg)
  }
}

function accumulateMysqlIndexRow(
  row: Record<string, unknown>,
  accum: Map<string, MysqlIndexAggregate>,
): void {
  const schema = asString(row.table_schema ?? row.TABLE_SCHEMA)
  const tableName = asString(row.table_name ?? row.TABLE_NAME)
  const indexName = asString(row.index_name ?? row.INDEX_NAME)
  const key = `${schema}.${tableName}.${indexName}`
  let agg = accum.get(key)
  if (!agg) {
    agg = {
      unique: !asBool(row.non_unique ?? row.NON_UNIQUE),
      method: asString(row.index_type ?? row.INDEX_TYPE),
      columns: [],
    }
    accum.set(key, agg)
  }
  agg.columns.push({
    seq: Number(row.seq_in_index ?? row.SEQ_IN_INDEX ?? 0),
    name: asString(row.column_name ?? row.COLUMN_NAME),
  })
}

function applyMysqlIndexAggregate(
  table: TableSnapshot,
  indexName: string,
  agg: MysqlIndexAggregate,
): void {
  const columns = agg.columns.sort((a, b) => a.seq - b.seq).map((c) => c.name)
  if (indexName === 'PRIMARY') {
    table.primaryKey = { name: 'PRIMARY', columns }
    return
  }
  if (agg.unique) {
    table.uniqueConstraints[indexName] = { columns }
  }
  table.indexes[indexName] = { columns, unique: agg.unique, method: agg.method }
}

interface MysqlFkAggregate {
  schema: string
  tableName: string
  name: string
  refSchema: string
  refTable: string
  onUpdate: ForeignKeyAction
  onDelete: ForeignKeyAction
  columns: { ord: number; col: string; refCol: string }[]
}

async function loadMysqlForeignKeys(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemasIn: string,
  excludeIn: string,
): Promise<void> {
  const fkRows = await executor.all(
    `SELECT
        rc.constraint_schema AS schema_name,
        rc.table_name AS table_name,
        rc.constraint_name AS constraint_name,
        rc.update_rule AS update_rule,
        rc.delete_rule AS delete_rule,
        rc.referenced_table_name AS ref_table,
        kcu.referenced_table_schema AS ref_schema,
        kcu.column_name AS column_name,
        kcu.referenced_column_name AS ref_column,
        kcu.ordinal_position AS ord
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = rc.constraint_schema
       AND kcu.constraint_name = rc.constraint_name
       AND kcu.table_name = rc.table_name
      WHERE rc.constraint_schema IN (${schemasIn})
        AND rc.table_name NOT IN (${excludeIn})
      ORDER BY rc.constraint_schema, rc.table_name, rc.constraint_name, kcu.ordinal_position`,
  )

  const fkAccum = new Map<string, MysqlFkAggregate>()
  for (const row of fkRows) {
    accumulateMysqlFkRow(row, fkAccum)
  }
  for (const agg of fkAccum.values()) {
    const table = snapshot.schemas[agg.schema]?.tables[agg.tableName]
    if (!table) continue
    const sorted = agg.columns.sort((a, b) => a.ord - b.ord)
    table.foreignKeys[agg.name] = {
      columns: sorted.map((c) => c.col),
      referencedSchema: agg.refSchema,
      referencedTable: agg.refTable,
      referencedColumns: sorted.map((c) => c.refCol),
      onUpdate: agg.onUpdate,
      onDelete: agg.onDelete,
    }
  }
}

function accumulateMysqlFkRow(
  row: Record<string, unknown>,
  accum: Map<string, MysqlFkAggregate>,
): void {
  const schema = asString(row.schema_name)
  const tableName = asString(row.table_name)
  const constraintName = asString(row.constraint_name)
  const key = `${schema}.${tableName}.${constraintName}`
  let agg = accum.get(key)
  if (!agg) {
    agg = {
      schema,
      tableName,
      name: constraintName,
      refSchema: asString(row.ref_schema),
      refTable: asString(row.ref_table),
      onUpdate: normalizeAction(asString(row.update_rule)),
      onDelete: normalizeAction(asString(row.delete_rule)),
      columns: [],
    }
    accum.set(key, agg)
  }
  agg.columns.push({
    ord: Number(row.ord),
    col: asString(row.column_name),
    refCol: asString(row.ref_column),
  })
}

async function loadMysqlCheckConstraints(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemasIn: string,
  excludeIn: string,
): Promise<void> {
  let checkRows: Record<string, unknown>[]
  try {
    checkRows = await executor.all(
      `SELECT
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          cc.check_clause
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON cc.constraint_schema = tc.constraint_schema
         AND cc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'CHECK'
          AND tc.table_schema IN (${schemasIn})
          AND tc.table_name NOT IN (${excludeIn})
        ORDER BY tc.table_schema, tc.table_name, tc.constraint_name`,
    )
  } catch (error) {
    // information_schema.check_constraints didn't ship until MySQL 8.0.16. Silently swallow
    // only that specific missing-table case; everything else (permissions, catalog corruption,
    // network) must surface so callers don't get silently incomplete snapshots.
    const message = error instanceof Error ? error.message : ''
    if (
      /check_constraints/i.test(message) &&
      /(unknown table|doesn't exist|does not exist|not exist)/i.test(message)
    ) {
      return
    }
    throw error
  }
  for (const row of checkRows) {
    const schema = asString(row.table_schema ?? row.TABLE_SCHEMA)
    const tableName = asString(row.table_name ?? row.TABLE_NAME)
    const constraintName = asString(row.constraint_name ?? row.CONSTRAINT_NAME)
    const table = snapshot.schemas[schema]?.tables[tableName]
    if (!table) continue
    table.checkConstraints[constraintName] = {
      expression: asString(row.check_clause ?? row.CHECK_CLAUSE),
    }
  }
}

function splitKey3(key: string): [string, string, string] {
  // Robustly split a 3-part key on the rightmost two dots. Schema/table names cannot contain
  // dots in practice for our caller, so a simple split works, but be defensive.
  const idx2 = key.lastIndexOf('.')
  const idx1 = key.lastIndexOf('.', idx2 - 1)
  return [key.slice(0, idx1), key.slice(idx1 + 1, idx2), key.slice(idx2 + 1)]
}
