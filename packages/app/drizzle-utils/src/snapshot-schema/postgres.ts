import type { SqlExecutor } from '../markMigrationsApplied.ts'
import {
  asBool,
  asNullableString,
  asString,
  emptySchemaContents,
  ensureTable,
  quotePgLiteralList,
} from './shared.ts'
import type {
  ColumnSnapshot,
  ForeignKeyAction,
  SchemaSnapshot,
  SnapshotDialect,
  TableSnapshot,
} from './types.ts'

export async function snapshotPostgres(
  executor: SqlExecutor,
  schemas: string[],
  excludeTables: Set<string>,
  dialect: SnapshotDialect,
): Promise<SchemaSnapshot> {
  const snapshot: SchemaSnapshot = { dialect, schemas: {} }
  for (const schema of schemas) {
    snapshot.schemas[schema] = emptySchemaContents()
  }

  const schemaList = quotePgLiteralList(schemas)
  const excludeList = excludeTables.size > 0 ? quotePgLiteralList([...excludeTables]) : "''"

  await loadPgTables(executor, snapshot, schemaList, excludeList)
  await loadPgColumns(executor, snapshot, schemaList, excludeList)
  // attMap is shared between constraint and index loading — fetch once.
  const attMap = await loadPgAttMap(executor, schemaList, excludeList)
  await loadPgConstraints(executor, snapshot, schemaList, excludeList, attMap)
  await loadPgIndexes(executor, snapshot, schemaList, excludeList, attMap)
  await loadPgEnums(executor, snapshot, schemaList)
  await loadPgSequences(executor, snapshot, schemaList)

  return snapshot
}

async function loadPgTables(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemaList: string,
  excludeList: string,
): Promise<void> {
  const tables = await executor.all(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_schema IN (${schemaList})
       AND table_type = 'BASE TABLE'
       AND table_name NOT IN (${excludeList})
     ORDER BY table_schema, table_name`,
  )
  for (const row of tables) {
    const schema = asString(row.table_schema)
    const name = asString(row.table_name)
    const contents = snapshot.schemas[schema]
    if (!contents) continue
    ensureTable(contents, name)
  }
}

async function loadPgColumns(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemaList: string,
  excludeList: string,
): Promise<void> {
  const columns = await executor.all(
    `SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.udt_schema,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.datetime_precision,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.identity_generation,
        c.is_generated,
        c.generation_expression
      FROM information_schema.columns c
      WHERE c.table_schema IN (${schemaList})
        AND c.table_name NOT IN (${excludeList})
      ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
  )

  for (const row of columns) {
    const schema = asString(row.table_schema)
    const tableName = asString(row.table_name)
    const contents = snapshot.schemas[schema]
    if (!contents) continue
    const table = contents.tables[tableName]
    if (!table) continue
    table.columns[asString(row.column_name)] = buildPgColumn(row)
  }
}

function buildPgColumn(row: Record<string, unknown>): ColumnSnapshot {
  return {
    type: buildPgType(row),
    nullable: asString(row.is_nullable) === 'YES',
    default: asNullableString(row.column_default),
    identity: parsePgIdentity(row),
    generated:
      asString(row.is_generated) === 'ALWAYS' ? asNullableString(row.generation_expression) : null,
  }
}

function parsePgIdentity(row: Record<string, unknown>): 'always' | 'by-default' | null {
  if (asString(row.is_identity) !== 'YES') return null
  return asString(row.identity_generation).toUpperCase() === 'ALWAYS' ? 'always' : 'by-default'
}

function buildPgType(row: Record<string, unknown>): string {
  const dataType = asString(row.data_type)
  return (
    buildPgUserDefinedType(dataType, row) ??
    buildPgCharType(dataType, row.character_maximum_length) ??
    buildPgNumericType(dataType, row.numeric_precision, row.numeric_scale) ??
    buildPgDatetimeType(dataType, row.datetime_precision) ??
    dataType
  )
}

function buildPgUserDefinedType(dataType: string, row: Record<string, unknown>): string | null {
  if (dataType !== 'USER-DEFINED' && dataType !== 'ARRAY') return null
  const udt = asString(row.udt_name)
  if (!udt) return null
  // Qualify user-defined types with their schema so two enums of the same name
  // in different schemas don't snapshot as identical. Built-ins (pg_catalog) stay unqualified
  // to keep names like `integer` / `_int4` readable.
  const udtSchema = asString(row.udt_schema)
  return udtSchema && udtSchema !== 'pg_catalog' ? `${udtSchema}.${udt}` : udt
}

function buildPgCharType(dataType: string, charLen: unknown): string | null {
  if (charLen == null) return null
  if (dataType === 'character varying') return `character varying(${charLen})`
  if (dataType === 'character') return `character(${charLen})`
  if (dataType === 'bit') return `bit(${charLen})`
  if (dataType === 'bit varying') return `bit varying(${charLen})`
  return null
}

function buildPgNumericType(
  dataType: string,
  numPrecision: unknown,
  numScale: unknown,
): string | null {
  if (dataType !== 'numeric' || numPrecision == null) return null
  if (numScale != null) return `numeric(${numPrecision},${numScale})`
  return `numeric(${numPrecision})`
}

function buildPgDatetimeType(dataType: string, datetimePrecision: unknown): string | null {
  if (datetimePrecision == null) return null
  // time/timestamp/interval may carry a fractional-seconds precision. information_schema
  // returns data_type as e.g. "timestamp without time zone" without baking precision into it,
  // so inject it after the base word: "timestamp(3) without time zone".
  // Order matters: `timestamp` must come before `time` so the longer prefix wins.
  const match = /^(timestamp|time|interval)(.*)$/.exec(dataType)
  if (!match) return null
  return `${match[1]}(${datetimePrecision})${match[2]}`
}

async function loadPgAttMap(
  executor: SqlExecutor,
  schemaList: string,
  excludeList: string,
): Promise<Map<string, Map<number, string>>> {
  const attRows = await executor.all(
    `SELECT n.nspname AS schema_name, cl.relname AS table_name, a.attnum, a.attname
      FROM pg_attribute a
      JOIN pg_class cl ON cl.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname IN (${schemaList})
        AND cl.relname NOT IN (${excludeList})
        AND a.attnum > 0
        AND NOT a.attisdropped`,
  )

  const attMap = new Map<string, Map<number, string>>()
  for (const row of attRows) {
    const key = `${asString(row.schema_name)}.${asString(row.table_name)}`
    let inner = attMap.get(key)
    if (!inner) {
      inner = new Map<number, string>()
      attMap.set(key, inner)
    }
    inner.set(Number(row.attnum), asString(row.attname))
  }
  return attMap
}

function resolvePgColumns(
  attMap: Map<string, Map<number, string>>,
  schemaName: string,
  tableName: string,
  attnums: unknown,
): string[] {
  const inner = attMap.get(`${schemaName}.${tableName}`)
  if (!inner) return []
  const arr = parsePgIntArray(attnums)
  return arr.map((n) => inner.get(n) ?? `attnum:${n}`)
}

async function loadPgConstraints(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemaList: string,
  excludeList: string,
  attMap: Map<string, Map<number, string>>,
): Promise<void> {
  // pg_constraint gives us the canonical view across types.
  // contype: 'p' primary, 'u' unique, 'f' foreign, 'c' check.
  const constraintRows = await executor.all(
    `SELECT
        n.nspname AS schema_name,
        cl.relname AS table_name,
        c.conname AS constraint_name,
        c.contype::text AS contype,
        c.condeferrable AS deferrable,
        c.confupdtype::text AS confupdtype,
        c.confdeltype::text AS confdeltype,
        pg_get_constraintdef(c.oid) AS definition,
        c.conkey AS conkey,
        c.confkey AS confkey,
        rn.nspname AS ref_schema,
        rcl.relname AS ref_table
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class cl ON cl.oid = c.conrelid
      LEFT JOIN pg_class rcl ON rcl.oid = c.confrelid
      LEFT JOIN pg_namespace rn ON rn.oid = rcl.relnamespace
      WHERE n.nspname IN (${schemaList})
        AND cl.relname NOT IN (${excludeList})
        AND c.contype IN ('p', 'u', 'f', 'c')
      ORDER BY n.nspname, cl.relname, c.conname`,
  )

  for (const row of constraintRows) {
    const schemaName = asString(row.schema_name)
    const tableName = asString(row.table_name)
    const contents = snapshot.schemas[schemaName]
    if (!contents) continue
    const table = contents.tables[tableName]
    if (!table) continue
    applyPgConstraintRow(table, row, schemaName, tableName, attMap)
  }
}

function applyPgConstraintRow(
  table: TableSnapshot,
  row: Record<string, unknown>,
  schemaName: string,
  tableName: string,
  attMap: Map<string, Map<number, string>>,
): void {
  const constraintName = asString(row.constraint_name)
  const contype = asString(row.contype)
  const cols = (a: unknown) => resolvePgColumns(attMap, schemaName, tableName, a)

  if (contype === 'p') {
    table.primaryKey = { name: constraintName, columns: cols(row.conkey) }
    return
  }
  if (contype === 'u') {
    table.uniqueConstraints[constraintName] = {
      columns: cols(row.conkey),
      deferrable: asBool(row.deferrable),
    }
    return
  }
  if (contype === 'f') {
    const refSchema = asString(row.ref_schema)
    const refTable = asString(row.ref_table)
    table.foreignKeys[constraintName] = {
      columns: cols(row.conkey),
      referencedSchema: refSchema,
      referencedTable: refTable,
      referencedColumns: resolvePgColumns(attMap, refSchema, refTable, row.confkey),
      onUpdate: pgFkActionFromCode(asString(row.confupdtype)),
      onDelete: pgFkActionFromCode(asString(row.confdeltype)),
    }
    return
  }
  if (contype === 'c') {
    table.checkConstraints[constraintName] = {
      expression: normalizeCheckDefinition(asString(row.definition)),
    }
  }
}

function pgFkActionFromCode(code: string): ForeignKeyAction {
  switch (code) {
    case 'a':
      return 'NO ACTION'
    case 'r':
      return 'RESTRICT'
    case 'c':
      return 'CASCADE'
    case 'n':
      return 'SET NULL'
    case 'd':
      return 'SET DEFAULT'
    default:
      return 'NO ACTION'
  }
}

function parsePgIntArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/^\{|\}$/g, '').trim()
    if (!cleaned) return []
    return cleaned
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  }
  return []
}

function normalizeCheckDefinition(raw: string): string {
  // pg_get_constraintdef returns 'CHECK ((expr))' — strip leading 'CHECK ' and surrounding parens
  // so two databases storing the same check don't diff because of redundant outer parens.
  const trimmed = raw.replace(/^CHECK\s*/i, '').trim()
  return trimmed
}

async function loadPgIndexes(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemaList: string,
  excludeList: string,
  attMap: Map<string, Map<number, string>>,
): Promise<void> {
  // pg_get_indexdef(index, column, pretty) returns the per-column expression text. We aggregate
  // them with a unit-separator delimiter (CHR(31)) so we can split on something that can't appear
  // in identifiers or expression syntax, then use the n=0 (expression column) entries by position.
  const rows = await executor.all(
    `SELECT
        n.nspname AS schema_name,
        cl.relname AS table_name,
        ic.relname AS index_name,
        am.amname AS method,
        ix.indisunique AS is_unique,
        ix.indkey::text AS indkey,
        pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
        COALESCE(
          (SELECT string_agg(pg_get_indexdef(ix.indexrelid, k::int, false), CHR(31) ORDER BY k)
           FROM generate_subscripts(ix.indkey, 1) AS k),
          ''
        ) AS index_exprs
      FROM pg_index ix
      JOIN pg_class ic ON ic.oid = ix.indexrelid
      JOIN pg_class cl ON cl.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_am am ON am.oid = ic.relam
      WHERE n.nspname IN (${schemaList})
        AND cl.relname NOT IN (${excludeList})
      ORDER BY n.nspname, cl.relname, ic.relname`,
  )

  for (const row of rows) {
    const schemaName = asString(row.schema_name)
    const tableName = asString(row.table_name)
    const contents = snapshot.schemas[schemaName]
    if (!contents) continue
    const table = contents.tables[tableName]
    if (!table) continue

    const indexName = asString(row.index_name)
    const inner = attMap.get(`${schemaName}.${tableName}`)
    const indkey = parsePgIntArray(row.indkey)
    const exprText = asString(row.index_exprs)
    const exprs = exprText === '' ? [] : exprText.split('\x1f')
    const columns = indkey.map((n, idx) => {
      if (n === 0) {
        // Expression index column: use the per-position pg_get_indexdef text so that
        // lower(email) and upper(email) snapshot distinctly.
        return exprs[idx] ?? '<expression>'
      }
      return inner?.get(n) ?? `attnum:${n}`
    })

    table.indexes[indexName] = {
      columns,
      unique: asBool(row.is_unique),
      method: asString(row.method),
      predicate: asNullableString(row.predicate),
    }
  }
}

async function loadPgEnums(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemaList: string,
): Promise<void> {
  const rows = await executor.all(
    `SELECT n.nspname AS schema_name, t.typname AS enum_name, e.enumlabel AS value, e.enumsortorder
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN (${schemaList})
      ORDER BY n.nspname, t.typname, e.enumsortorder`,
  )
  for (const row of rows) {
    const schemaName = asString(row.schema_name)
    const enumName = asString(row.enum_name)
    const contents = snapshot.schemas[schemaName]
    if (!contents) continue
    let entry = contents.enums[enumName]
    if (!entry) {
      entry = { values: [] }
      contents.enums[enumName] = entry
    }
    entry.values.push(asString(row.value))
  }
}

async function loadPgSequences(
  executor: SqlExecutor,
  snapshot: SchemaSnapshot,
  schemaList: string,
): Promise<void> {
  const rows = await executor.all(
    `SELECT
        sequence_schema,
        sequence_name,
        data_type,
        start_value,
        increment,
        minimum_value,
        maximum_value,
        cycle_option
      FROM information_schema.sequences
      WHERE sequence_schema IN (${schemaList})
      ORDER BY sequence_schema, sequence_name`,
  )
  for (const row of rows) {
    const schemaName = asString(row.sequence_schema)
    const name = asString(row.sequence_name)
    const contents = snapshot.schemas[schemaName]
    if (!contents) continue
    contents.sequences[name] = {
      dataType: asString(row.data_type),
      start: asString(row.start_value),
      increment: asString(row.increment),
      minValue: asString(row.minimum_value),
      maxValue: asString(row.maximum_value),
      cycle: asString(row.cycle_option).toUpperCase() === 'YES',
    }
  }
}
