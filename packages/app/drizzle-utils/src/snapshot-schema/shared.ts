import type { ForeignKeyAction, SchemaContents, SnapshotDialect, TableSnapshot } from './types.ts'

export const DEFAULT_EXCLUDE_TABLES = ['__drizzle_migrations', '_prisma_migrations']

export function isPgLike(dialect: SnapshotDialect): boolean {
  return dialect === 'postgresql' || dialect === 'cockroachdb'
}

export function emptySchemaContents(): SchemaContents {
  return { tables: {}, enums: {}, sequences: {} }
}

export function emptyTable(): TableSnapshot {
  return {
    columns: {},
    primaryKey: null,
    uniqueConstraints: {},
    foreignKeys: {},
    checkConstraints: {},
    indexes: {},
  }
}

export function quotePgLiteralList(values: string[]): string {
  if (values.length === 0) return "''"
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')
}

export function quoteMysqlLiteralList(values: string[]): string {
  if (values.length === 0) return "''"
  return values.map((v) => `'${v.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`).join(', ')
}

export function asString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

export function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (value === 'YES' || value === 'yes' || value === 't' || value === 'true') return true
  return false
}

export function ensureTable(contents: SchemaContents, tableName: string): TableSnapshot {
  let table = contents.tables[tableName]
  if (!table) {
    table = emptyTable()
    contents.tables[tableName] = table
  }
  return table
}

export function normalizeAction(action: string | null | undefined): ForeignKeyAction {
  if (!action) return 'NO ACTION'
  const upper = action.toUpperCase()
  switch (upper) {
    case 'NO ACTION':
    case 'RESTRICT':
    case 'CASCADE':
    case 'SET NULL':
    case 'SET DEFAULT':
      return upper
    default:
      return 'NO ACTION'
  }
}
