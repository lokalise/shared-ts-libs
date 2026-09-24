import { describe, expect, it } from 'vitest'
import { parseRunnerArgs, splitValueArgs } from './args.ts'

const spec = {
  commands: ['run', 'up', 'down'] as const,
  flags: { keep: false, docker: true, purgeProfiles: false },
  help: 'Usage: runner <run|up|down>',
}

describe('parseRunnerArgs', () => {
  it('uses the defaults for an empty argv', () => {
    expect(parseRunnerArgs([], spec)).toEqual({
      command: 'run',
      flags: { keep: false, docker: true, purgeProfiles: false },
      k6Mode: 'auto',
      passthrough: [],
    })
  })

  it('honours an explicit default command', () => {
    expect(parseRunnerArgs([], { ...spec, defaultCommand: 'up' }).command).toBe('up')
  })

  it('sets flags from --name and --no-name, in kebab case', () => {
    const { flags } = parseRunnerArgs(['up', '--keep', '--no-docker', '--purge-profiles'], spec)
    expect(flags).toEqual({ keep: true, docker: false, purgeProfiles: true })
  })

  it('lets the later of two contradicting flags win', () => {
    expect(parseRunnerArgs(['run', '--keep', '--no-keep'], spec).flags.keep).toBe(false)
  })

  it('reads --k6=<mode>', () => {
    expect(parseRunnerArgs(['run', '--k6=docker'], spec).k6Mode).toBe('docker')
    expect(parseRunnerArgs(['run', '--k6=local'], spec).k6Mode).toBe('local')
    expect(parseRunnerArgs(['run', '--k6=docker', '--k6=auto'], spec).k6Mode).toBe('auto')
  })

  it('passes everything else through in order and drops a bare --', () => {
    const { passthrough } = parseRunnerArgs(
      ['run', '--', '-e', 'JOURNEYS=search', '--vus', '5', '--keep'],
      spec,
    )
    expect(passthrough).toEqual(['-e', 'JOURNEYS=search', '--vus', '5'])
  })

  it('drops a bare -- in front of the command', () => {
    expect(parseRunnerArgs(['--', 'up', '--keep'], spec)).toMatchObject({
      command: 'up',
      flags: { keep: true },
      passthrough: [],
    })
    expect(parseRunnerArgs(['--'], spec).command).toBe('run')
  })

  it('rejects an unknown command with the help text', () => {
    expect(() => parseRunnerArgs(['launch'], spec)).toThrow(
      'unknown command "launch"\nUsage: runner <run|up|down>',
    )
    expect(() => parseRunnerArgs(['launch'], { ...spec, help: undefined })).toThrow(
      /^unknown command "launch"$/,
    )
  })

  it('does not mutate the spec defaults', () => {
    parseRunnerArgs(['run', '--keep'], spec)
    expect(spec.flags.keep).toBe(false)
  })
})

describe('splitValueArgs', () => {
  it('takes the named --name=value args in --name value form', () => {
    expect(
      splitValueArgs(
        ['--items=50', '-e', 'X=1', '--contentUnitsPerItem=3', '--vus', '2'],
        ['items', 'contentUnitsPerItem'],
      ),
    ).toEqual({
      taken: ['--items', '50', '--contentUnitsPerItem', '3'],
      rest: ['-e', 'X=1', '--vus', '2'],
    })
  })

  it('keeps a value that contains an equals sign whole', () => {
    expect(splitValueArgs(['--filter=a=b'], ['filter']).taken).toEqual(['--filter', 'a=b'])
  })

  it('leaves a prefix match alone', () => {
    expect(splitValueArgs(['--itemsTotal=5'], ['items'])).toEqual({
      taken: [],
      rest: ['--itemsTotal=5'],
    })
  })
})
