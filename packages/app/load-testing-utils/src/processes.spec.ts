import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ProcessSupervisor, processStartTime, stopProcess, toSpawnable } from './processes.ts'

const node = process.execPath
const logDir = () => mkdtempSync(join(tmpdir(), 'supervisor-'))

const exited = (child: { once: (event: 'close', listener: () => void) => void }) =>
  new Promise<void>((done) => child.once('close', done))

describe('toSpawnable', () => {
  it('spawns directly outside Windows, and anything that is not a shim on Windows', () => {
    expect(toSpawnable('npx', ['tsx', 'a.ts'], 'linux')).toEqual({
      file: 'npx',
      argv: ['tsx', 'a.ts'],
      shell: false,
    })
    expect(toSpawnable('docker', ['ps'], 'win32')).toEqual({
      file: 'docker',
      argv: ['ps'],
      shell: false,
    })
  })

  it('sends a Windows shim through the shell as one line', () => {
    expect(toSpawnable('pnpm', ['run', 'x'], 'win32')).toEqual({
      file: 'pnpm run x',
      argv: [],
      shell: true,
    })
    expect(toSpawnable('bun', ['x'], 'win32', ['bun']).shell).toBe(true)
  })
})

describe('ProcessSupervisor', () => {
  it('prefixes each output line, writes a log file, and reports a failed exit', async () => {
    const dir = logDir()
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: dir, log })

    const child = supervisor.start(
      'echo',
      node,
      ['-e', 'console.log("one\\n\\ntwo"); console.error("three"); process.exit(3)'],
      { env: { EXTRA: '1' } },
    )
    await exited(child)

    const lines = log.mock.calls.map(([line]) => line)
    expect(lines).toEqual(
      expect.arrayContaining(['[echo] one', '[echo] two', '[echo] three', '[echo] exited with 3']),
    )
    expect(lines).not.toContain('[echo] ')
    expect(readFileSync(join(dir, 'echo.log'), 'utf8')).toContain('one')
    expect(supervisor.runningProcesses()).toEqual([])
  })

  it('joins a line that arrives in two chunks', async () => {
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: logDir(), log })

    const child = supervisor.start('split', node, [
      '-e',
      'process.stdout.write("hel"); setTimeout(() => process.stdout.write("lo\\nwor"), 50); setTimeout(() => process.stdout.write("ld"), 100)',
    ])
    await exited(child)

    expect(log.mock.calls.map(([line]) => line)).toEqual(['[split] hello', '[split] world'])
  })

  it('logs a process that fails to start instead of throwing', async () => {
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: logDir(), log })

    const child = supervisor.start('missing', 'surely-not-a-command-here', [])
    await new Promise((done) => child.once('error', done))

    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[missing\] failed to start: /))
    expect(supervisor.runningProcesses()).toEqual([])
  })

  it('passes env and cwd to started processes', async () => {
    const dir = logDir()
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: dir, log })

    const child = supervisor.start(
      'env',
      node,
      ['-e', 'console.log(process.env.EXTRA + " " + process.cwd())'],
      { env: { EXTRA: 'set' }, cwd: dir },
    )
    await exited(child)

    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[env\] set .*supervisor-/))
  })

  it('stops running processes in reverse order, and records them for another terminal', async () => {
    const dir = logDir()
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: dir, log })
    const keepAlive = ['-e', 'setInterval(() => {}, 1000)']

    const first = supervisor.start('first', node, keepAlive)
    const second = supervisor.start('second', node, keepAlive)
    expect(supervisor.runningProcesses().map(({ name }) => name)).toEqual(['first', 'second'])

    supervisor.writeState({ profiling: true })
    const other = new ProcessSupervisor({ logDir: dir, log })
    expect(other.readState()).toMatchObject({ profiling: true, pids: [{ name: 'first' }, {}] })
    expect(other.recordedProcesses()).toEqual([
      { name: 'first', pid: first.pid, startTime: expect.any(String) },
      { name: 'second', pid: second.pid, startTime: expect.any(String) },
    ])

    const closed = Promise.all([exited(first), exited(second)])
    supervisor.stopAll()
    await closed

    const stops = log.mock.calls.map(([line]) => line).filter((line) => line.includes('stopping'))
    expect(stops).toEqual(['[runner] stopping second', '[runner] stopping first'])
    expect(supervisor.runningProcesses()).toEqual([])

    other.clearState()
    expect(other.readState()).toBeUndefined()
    expect(other.recordedProcesses()).toEqual([])
    other.clearState()
  })

  it('skips a recorded pid that no longer belongs to the process it started', async () => {
    const dir = logDir()
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: dir, log })
    const child = supervisor.start('service', node, ['-e', 'setInterval(() => {}, 1000)'])
    supervisor.writeState()
    const pid = child.pid as number

    const recorded = (pids: object[]) => {
      writeFileSync(supervisor.stateFile, JSON.stringify({ startedAt: '', pids }))
      return new ProcessSupervisor({ logDir: dir, log }).recordedProcesses()
    }
    expect(recorded([{ name: 'service', pid, startTime: 'another process' }])).toEqual([])
    expect(recorded([{ name: 'service', pid }])).toEqual([])
    expect(log).toHaveBeenCalledWith(
      `[runner] skipping service: pid ${pid} is no longer the process this stack started`,
    )

    const closed = exited(child)
    supervisor.stopAll()
    await closed
  })

  it('honours a custom state file', () => {
    const dir = logDir()
    const stateFile = join(dir, 'nested', 'state.json')
    const supervisor = new ProcessSupervisor({ logDir: dir, stateFile, log: () => {} })
    supervisor.writeState()
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toMatchObject({ pids: [] })
  })

  it('runs a command to completion and throws when it fails', () => {
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: logDir(), log })

    expect(() =>
      supervisor.run('ok', node, ['-e', 'process.exit(0)'], { env: { A: '1' } }),
    ).not.toThrow()
    expect(log).toHaveBeenCalledWith(`[ok] ${node} -e process.exit(0)`)
    expect(() => supervisor.run('bad', node, ['-e', 'process.exit(2)'])).toThrow(
      'bad failed with exit code 2',
    )
    expect(() => supervisor.run('missing', 'surely-not-a-command-here', [])).toThrow(
      /missing failed with exit code unknown: /,
    )
  })

  it('runs a command to exit asynchronously and resolves with its code', async () => {
    const log = vi.fn()
    const supervisor = new ProcessSupervisor({ logDir: logDir(), log })

    await expect(supervisor.runToExit(node, ['-e', 'process.exit(4)'])).resolves.toBe(4)
    await expect(supervisor.runToExit('surely-not-a-command-here', [])).resolves.toBe(1)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[runner] surely-not-a-command-here failed to start'),
    )
  })

  it('logs to stdout by default', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    new ProcessSupervisor({ logDir: logDir() }).run('ok', node, ['-e', ''])
    expect(write).toHaveBeenCalledWith(`[ok] ${node} -e \n`)
    write.mockRestore()
  })
})

describe('processStartTime', () => {
  it('is stable for a running process and undefined for one that does not exist', () => {
    expect(processStartTime(process.pid)).toBeDefined()
    expect(processStartTime(process.pid)).toBe(processStartTime(process.pid))
    expect(processStartTime(2 ** 22 + 12345)).toBeUndefined()
    expect(processStartTime(0)).toBeUndefined()
  })
})

describe('stopProcess', () => {
  it('tolerates a process that is already gone', () => {
    const log = vi.fn()
    expect(() => stopProcess('ghost', 2 ** 22 + 12345, { log, platform: 'linux' })).not.toThrow()
    expect(log).toHaveBeenCalledWith('[runner] stopping ghost')
  })

  it('kills the whole tree on Windows', async () => {
    const supervisor = new ProcessSupervisor({ logDir: logDir(), log: () => {} })
    const child = supervisor.start('tree', node, ['-e', 'setInterval(() => {}, 1000)'])
    const closed = exited(child)
    stopProcess('tree', child.pid as number, { log: () => {}, platform: process.platform })
    await closed
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })

  it.skipIf(process.platform === 'win32')(
    'stops the processes under the pid on POSIX',
    async () => {
      const supervisor = new ProcessSupervisor({ logDir: logDir(), log: () => {} })
      const grandchildScript = 'setInterval(() => {}, 1000)'
      const child = supervisor.start('wrapper', node, [
        '-e',
        `const c = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchildScript)}], { stdio: 'ignore' }); console.log('grandchild ' + c.pid); setInterval(() => {}, 1000)`,
      ])
      const grandchild = await new Promise<number>((done) => {
        child.stdout?.on('data', (chunk: string) => {
          const match = /grandchild (\d+)/.exec(chunk)
          if (match) done(Number(match[1]))
        })
      })

      const closed = exited(child)
      stopProcess('wrapper', child.pid as number, { log: () => {} })
      await closed
      await vi.waitFor(() => expect(processStartTime(grandchild)).toBeUndefined(), 5000)
    },
  )

  it('logs to stdout by default', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stopProcess('ghost', 2 ** 22 + 12345, { platform: 'linux' })
    expect(write).toHaveBeenCalledWith('[runner] stopping ghost\n')
    write.mockRestore()
  })
})
