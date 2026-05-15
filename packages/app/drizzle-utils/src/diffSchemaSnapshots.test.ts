import { describe, expect, it } from 'vitest'
import { diffSchemaSnapshots } from './diffSchemaSnapshots.ts'
import type { SchemaSnapshot } from './snapshotSchema.ts'

function makeSnapshot(): SchemaSnapshot {
  return {
    dialect: 'postgresql',
    schemas: {
      public: {
        tables: {
          users: {
            columns: {
              id: {
                type: 'integer',
                nullable: false,
                default: null,
                identity: 'by-default',
                generated: null,
              },
              email: {
                type: 'character varying(255)',
                nullable: false,
                default: null,
                identity: null,
                generated: null,
              },
            },
            primaryKey: { name: 'users_pkey', columns: ['id'] },
            uniqueConstraints: {
              users_email_key: { columns: ['email'], deferrable: false },
            },
            foreignKeys: {},
            checkConstraints: {},
            indexes: {
              users_pkey: { columns: ['id'], unique: true, method: 'btree' },
              users_email_key: { columns: ['email'], unique: true, method: 'btree' },
            },
          },
        },
        enums: {},
        sequences: {},
      },
    },
  }
}

describe('diffSchemaSnapshots', () => {
  it('reports equal when snapshots are identical', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(true)
    expect(diff.differences).toEqual([])
  })

  it('detects a missing table', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    delete b.schemas.public!.tables.users
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences).toHaveLength(1)
    expect(diff.differences[0]!.kind).toBe('removed')
    expect(diff.differences[0]!.path).toBe('schemas.public.tables.users')
  })

  it('detects an added table', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    b.schemas.public!.tables.orders = {
      columns: {},
      primaryKey: null,
      uniqueConstraints: {},
      foreignKeys: {},
      checkConstraints: {},
      indexes: {},
    }
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences).toHaveLength(1)
    expect(diff.differences[0]!.kind).toBe('added')
    expect(diff.differences[0]!.path).toBe('schemas.public.tables.orders')
  })

  it('detects a column type change', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    b.schemas.public!.tables.users!.columns.email!.type = 'text'
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences).toEqual([
      {
        path: 'schemas.public.tables.users.columns.email.type',
        kind: 'changed',
        before: 'character varying(255)',
        after: 'text',
      },
    ])
  })

  it('detects nullable change', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    b.schemas.public!.tables.users!.columns.email!.nullable = true
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences[0]!.path).toBe('schemas.public.tables.users.columns.email.nullable')
  })

  it('detects a primary key rename — STRICT name comparison', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    b.schemas.public!.tables.users!.primaryKey!.name = 'User_pkey'
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences).toEqual([
      {
        path: 'schemas.public.tables.users.primaryKey.name',
        kind: 'changed',
        before: 'users_pkey',
        after: 'User_pkey',
      },
    ])
  })

  it('detects a unique constraint rename — STRICT name comparison', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    // Same column constraint, different name — should still diff.
    const uc = b.schemas.public!.tables.users!.uniqueConstraints.users_email_key!
    delete b.schemas.public!.tables.users!.uniqueConstraints.users_email_key
    b.schemas.public!.tables.users!.uniqueConstraints.User_email_key = uc
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences.some((d) => d.path.endsWith('.User_email_key'))).toBe(true)
    expect(diff.differences.some((d) => d.path.endsWith('.users_email_key'))).toBe(true)
  })

  it('detects a column order change in a foreign key as a structural diff', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    a.schemas.public!.tables.users!.foreignKeys.fk = {
      columns: ['a', 'b'],
      referencedSchema: 'public',
      referencedTable: 'other',
      referencedColumns: ['x', 'y'],
      onUpdate: 'NO ACTION',
      onDelete: 'NO ACTION',
    }
    b.schemas.public!.tables.users!.foreignKeys.fk = {
      columns: ['b', 'a'],
      referencedSchema: 'public',
      referencedTable: 'other',
      referencedColumns: ['y', 'x'],
      onUpdate: 'NO ACTION',
      onDelete: 'NO ACTION',
    }
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    // Should flag both ordered arrays as changed
    const paths = diff.differences.map((d) => d.path)
    expect(paths).toContain('schemas.public.tables.users.foreignKeys.fk.columns')
    expect(paths).toContain('schemas.public.tables.users.foreignKeys.fk.referencedColumns')
  })

  it('does NOT flag changes when key order in objects differs (only values matter)', () => {
    const a = makeSnapshot()
    const b: SchemaSnapshot = JSON.parse(JSON.stringify(a))
    // Rebuild columns object with reversed insertion order — should still be equal
    const usersTable = b.schemas.public!.tables.users!
    const original = usersTable.columns
    usersTable.columns = {
      email: original.email!,
      id: original.id!,
    }
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(true)
  })

  it('produces stable, sorted output ordering of differences', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    b.schemas.public!.tables.users!.columns.email!.type = 'text'
    b.schemas.public!.tables.users!.columns.id!.type = 'bigint'
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.differences.map((d) => d.path)).toEqual([
      'schemas.public.tables.users.columns.email.type',
      'schemas.public.tables.users.columns.id.type',
    ])
  })

  it('detects an enum value addition', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    a.schemas.public!.enums.color = { values: ['red', 'green'] }
    b.schemas.public!.enums.color = { values: ['red', 'green', 'blue'] }
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences[0]!.path).toBe('schemas.public.enums.color.values')
  })

  it('detects dialect mismatch at the top level', () => {
    const a = makeSnapshot()
    const b = makeSnapshot()
    b.dialect = 'mysql'
    const diff = diffSchemaSnapshots(a, b)
    expect(diff.equal).toBe(false)
    expect(diff.differences[0]!.path).toBe('dialect')
  })
})
