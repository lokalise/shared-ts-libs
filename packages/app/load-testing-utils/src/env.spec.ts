import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { omitExported, parseEnvFile, readEnvFile, retargetPorts } from './env.ts'

describe('parseEnvFile', () => {
  it('reads keys and values, skipping comments, blanks and lines with no separator', () => {
    const contents = [
      '# a comment',
      '',
      'PLAIN=value',
      '  SPACED = padded  ',
      'QUOTED="with spaces"',
      'DSN=postgres://u:p@localhost:5451/db?x=1',
      'EMPTY=',
      'not a pair',
      'LONE="',
    ].join('\n')

    expect(parseEnvFile(contents)).toEqual({
      PLAIN: 'value',
      SPACED: 'padded',
      QUOTED: 'with spaces',
      DSN: 'postgres://u:p@localhost:5451/db?x=1',
      EMPTY: '',
      LONE: '"',
    })
  })

  it('handles CRLF line endings', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })

  it('reads a file from disk', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'env-')), 'perf.env')
    writeFileSync(path, 'A=1\n')
    expect(readEnvFile(path)).toEqual({ A: '1' })
  })
})

describe('retargetPorts', () => {
  const portVariables = { '5451': 'PERF_POSTGRES_PORT', '6411': 'PERF_VALKEY_PORT' }

  it('moves ports inside DSNs and bare *_PORT values', () => {
    expect(
      retargetPorts(
        {
          DATABASE_URL: 'postgres://u:p@localhost:5451/db',
          REDIS_PORT: '6411',
          OTHER_URL: 'http://localhost:9999',
          NAME: '6411',
        },
        portVariables,
        { PERF_POSTGRES_PORT: '15451', PERF_VALKEY_PORT: '16411' },
      ),
    ).toEqual({
      DATABASE_URL: 'postgres://u:p@localhost:15451/db',
      REDIS_PORT: '16411',
      OTHER_URL: 'http://localhost:9999',
      NAME: '6411',
    })
  })

  it('keeps the default when the variable is unset or empty', () => {
    expect(
      retargetPorts({ DATABASE_URL: 'localhost:5451', REDIS_PORT: '6411' }, portVariables, {
        PERF_VALKEY_PORT: '',
      }),
    ).toEqual({ DATABASE_URL: 'localhost:5451', REDIS_PORT: '6411' })
  })

  it('reads process.env by default', () => {
    expect(retargetPorts({ A: 'localhost:1' }, {})).toEqual({ A: 'localhost:1' })
  })
})

describe('omitExported', () => {
  it('drops keys the environment already has, even when empty', () => {
    expect(omitExported({ A: '1', B: '2', C: '3' }, { B: 'shell', C: '' })).toEqual({ A: '1' })
  })

  it('reads process.env by default', () => {
    const key = 'LOAD_TESTING_UTILS_SURELY_UNSET'
    expect(omitExported({ [key]: 'x' })).toEqual({ [key]: 'x' })
  })
})
