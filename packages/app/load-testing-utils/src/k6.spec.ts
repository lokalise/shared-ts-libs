import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  bindAddressEnv,
  buildK6Command,
  DEFAULT_K6_IMAGE,
  k6TargetHost,
  resolveK6Mode,
  runK6,
} from './k6.ts'
import type { ProcessSupervisor } from './processes.ts'

describe('resolveK6Mode', () => {
  it('keeps an explicit mode without probing', () => {
    const probe = vi.fn(() => true)
    expect(resolveK6Mode('docker', probe)).toBe('docker')
    expect(resolveK6Mode('local', probe)).toBe('local')
    expect(probe).not.toHaveBeenCalled()
  })

  it('picks local when k6 is installed and docker otherwise', () => {
    expect(resolveK6Mode('auto', () => true)).toBe('local')
    expect(resolveK6Mode('auto', () => false)).toBe('docker')
  })

  it('probes the real PATH by default', () => {
    expect(['local', 'docker']).toContain(resolveK6Mode('auto'))
  })
})

describe('k6TargetHost', () => {
  it('reaches the host through the docker alias from a container', () => {
    expect(k6TargetHost('local')).toBe('localhost')
    expect(k6TargetHost('docker')).toBe('host.docker.internal')
  })
})

describe('bindAddressEnv', () => {
  it('binds loopback for a local k6 and every interface for a docker one', () => {
    expect(bindAddressEnv('local', ['A', 'B'], {})).toEqual({ A: '127.0.0.1', B: '127.0.0.1' })
    expect(bindAddressEnv('docker', ['A'], {})).toEqual({ A: '0.0.0.0' })
  })

  it('leaves out a variable the shell exported', () => {
    expect(bindAddressEnv('docker', ['A', 'B'], { A: '10.0.0.1' })).toEqual({ B: '0.0.0.0' })
  })

  it('reads process.env by default', () => {
    expect(bindAddressEnv('local', ['LOAD_TESTING_UTILS_SURELY_UNSET'])).toEqual({
      LOAD_TESTING_UTILS_SURELY_UNSET: '127.0.0.1',
    })
  })
})

describe('buildK6Command', () => {
  const perfDir = resolve('/repo/tests/perf')
  const k6Dir = join(perfDir, 'local', 'k6')

  it('runs a local k6 in cwd with env as the process environment', () => {
    expect(
      buildK6Command({
        mode: 'local',
        cwd: k6Dir,
        script: 'journeys.js',
        args: ['--vus', '2'],
        env: { BASE_URL: 'http://localhost:3000' },
      }),
    ).toEqual({
      command: 'k6',
      args: ['run', '--vus', '2', 'journeys.js'],
      cwd: k6Dir,
      env: { BASE_URL: 'http://localhost:3000' },
    })
  })

  it('defaults args and env to empty', () => {
    expect(buildK6Command({ mode: 'local', cwd: k6Dir, script: 's.js' })).toMatchObject({
      args: ['run', 's.js'],
      env: {},
    })
  })

  it('runs a docker k6 with the mount, the host alias, -e flags and the container paths', () => {
    const command = buildK6Command({
      mode: 'docker',
      cwd: k6Dir,
      script: 'journeys.js',
      args: ['--vus', '2'],
      env: { BASE_URL: 'http://host.docker.internal:3000' },
      docker: { hostDir: perfDir, containerDir: '/perf', image: 'grafana/k6:1.0.0' },
    })

    expect(command).toEqual({
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-i',
        '--add-host',
        'host.docker.internal:host-gateway',
        '-v',
        `${perfDir}:/perf`,
        '-w',
        '/perf/local/k6',
        '-e',
        'BASE_URL=http://host.docker.internal:3000',
        'grafana/k6:1.0.0',
        'run',
        '--vus',
        '2',
        '/perf/local/k6/journeys.js',
      ],
      cwd: k6Dir,
      env: {},
    })
  })

  it('defaults the container directory and image', () => {
    const { args } = buildK6Command({
      mode: 'docker',
      cwd: perfDir,
      script: join(perfDir, 'a', 'b.js'),
      docker: { hostDir: perfDir },
    })
    expect(args).toContain(`${perfDir}:/k6`)
    expect(args).toContain(DEFAULT_K6_IMAGE)
    expect(args.slice(args.indexOf('-w'), args.indexOf('-w') + 2)).toEqual(['-w', '/k6'])
    expect(args.at(-1)).toBe('/k6/a/b.js')
  })

  it('refuses a script outside the mount, and docker mode without docker options', () => {
    expect(() =>
      buildK6Command({
        mode: 'docker',
        cwd: k6Dir,
        script: '../../../elsewhere.js',
        docker: { hostDir: perfDir },
      }),
    ).toThrow(/outside the directory mounted/)
    expect(() => buildK6Command({ mode: 'docker', cwd: k6Dir, script: 's.js' })).toThrow(
      /needs the docker options/,
    )
  })
})

describe('runK6', () => {
  it('runs the built command through the supervisor and returns its exit code', async () => {
    const runToExit = vi.fn(() => Promise.resolve(99))
    const supervisor = { runToExit } as unknown as ProcessSupervisor

    await expect(
      runK6(supervisor, { mode: 'local', cwd: '/k6', script: 's.js', env: { A: '1' } }),
    ).resolves.toBe(99)
    expect(runToExit).toHaveBeenCalledWith('k6', ['run', 's.js'], { cwd: '/k6', env: { A: '1' } })
  })
})
