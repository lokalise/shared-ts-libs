import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  computeMigrationHash,
  detectMigrationFormat,
  readMigrationEntries,
  readMigrationJournal,
  readMigrationsWithDialect,
  resolveDialect,
} from './markMigrationsApplied.ts'

const FIXTURES_DIR = resolve(__dirname, '../test/fixtures')
const PG_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations')
const MYSQL_MIGRATIONS_DIR = join(FIXTURES_DIR, 'migrations-mysql')
const PG_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format')
const MYSQL_NEW_FORMAT_DIR = join(FIXTURES_DIR, 'migrations-new-format-mysql')

describe('computeMigrationHash', () => {
  it('returns a SHA-256 hex digest', () => {
    const hash = computeMigrationHash('SELECT 1;')
    expect(hash).toBe(createHash('sha256').update('SELECT 1;').digest('hex'))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns different hashes for different content', () => {
    expect(computeMigrationHash('CREATE TABLE a (id int);')).not.toBe(
      computeMigrationHash('CREATE TABLE b (id int);'),
    )
  })
})

describe('detectMigrationFormat', () => {
  it('returns "journal" for legacy format with meta/_journal.json', () => {
    expect(detectMigrationFormat(PG_MIGRATIONS_DIR)).toBe('journal')
  })

  it('returns "folder" for new format without meta/_journal.json', () => {
    expect(detectMigrationFormat(PG_NEW_FORMAT_DIR)).toBe('folder')
  })
})

describe('readMigrationJournal', () => {
  it('reads and parses the journal file', () => {
    const journal = readMigrationJournal(PG_MIGRATIONS_DIR)
    expect(journal.dialect).toBe('postgresql')
    expect(journal.entries.map((e) => e.tag)).toEqual(['0000_init', '0001_add_users'])
  })

  it('throws when journal does not exist', () => {
    expect(() => readMigrationJournal('/nonexistent/path')).toThrow()
  })
})

describe('readMigrationEntries (legacy journal format)', () => {
  it('reads entries with computed hashes and timestamps', () => {
    const entries = readMigrationEntries(PG_MIGRATIONS_DIR)
    expect(entries).toHaveLength(2)

    const initSql = readFileSync(join(PG_MIGRATIONS_DIR, '0000_init.sql'), 'utf-8')
    expect(entries[0]!.tag).toBe('0000_init')
    expect(entries[0]!.hash).toBe(createHash('sha256').update(initSql).digest('hex'))
    expect(entries[0]!.createdAt).toBe(1700000000000)
  })
})

describe('readMigrationEntries (new folder format)', () => {
  it('reads entries from folder-per-migration structure', () => {
    const entries = readMigrationEntries(PG_NEW_FORMAT_DIR)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.tag).toMatch(/^\d{14}_init$/)
    expect(entries[1]!.tag).toMatch(/^\d{14}_add_users$/)

    const dirs = readdirSync(PG_NEW_FORMAT_DIR).sort()
    const initSql = readFileSync(join(PG_NEW_FORMAT_DIR, dirs[0]!, 'migration.sql'), 'utf-8')
    expect(entries[0]!.hash).toBe(createHash('sha256').update(initSql).digest('hex'))
    expect(entries[0]!.createdAt).toBeGreaterThan(0)
  })
})

describe('readMigrationsWithDialect', () => {
  it('detects dialect from the legacy journal', () => {
    expect(readMigrationsWithDialect(MYSQL_MIGRATIONS_DIR).dialect).toBe('mysql')
  })

  it('detects (and normalizes) dialect from the new-format snapshot', () => {
    // PG snapshot.json uses dialect "postgres", normalized to "postgresql".
    expect(readMigrationsWithDialect(PG_NEW_FORMAT_DIR).dialect).toBe('postgresql')
    expect(readMigrationsWithDialect(MYSQL_NEW_FORMAT_DIR).dialect).toBe('mysql')
  })
})

describe('resolveDialect', () => {
  it('prefers the explicit dialect over the detected one', () => {
    expect(resolveDialect('mysql', 'postgresql')).toBe('postgresql')
  })

  it('falls back to the detected dialect, normalizing aliases', () => {
    expect(resolveDialect('postgres')).toBe('postgresql')
  })

  it('throws for an unsupported dialect', () => {
    expect(() => resolveDialect('sqlite')).toThrow('Unsupported dialect "sqlite"')
  })
})
