import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const writeLine = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

/** Commands that are `.cmd` shims on Windows. */
export const DEFAULT_SHIM_COMMANDS: readonly string[] = ['npx', 'pnpm', 'npm', 'yarn']

export type SpawnOptions = {
  cwd?: string
  /** Merged over `process.env`. */
  env?: NodeJS.ProcessEnv
}

export type RecordedProcess = { name: string; pid: number }

export type StackState = {
  startedAt: string
  pids: RecordedProcess[]
  [key: string]: unknown
}

export type ProcessSupervisorOptions = {
  /** Where each started process's `<name>.log` goes. */
  logDir: string
  /** @default `<logDir>/stack-state.json` */
  stateFile?: string
  /** @default {@link DEFAULT_SHIM_COMMANDS} */
  shimCommands?: readonly string[]
  /** @default a line on stdout */
  log?: (line: string) => void
  /** @default process.platform */
  platform?: NodeJS.Platform
}

export type Spawnable = { file: string; argv: string[]; shell: boolean }

/**
 * `shell: false` with an explicit argv, because a Windows path holds characters
 * a shell would reinterpret. The exception is a `.cmd` shim, which Node refuses
 * to spawn without a shell (EINVAL). That goes through cmd.exe as one line, so
 * its arguments must contain no spaces.
 */
export function toSpawnable(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  shimCommands: readonly string[] = DEFAULT_SHIM_COMMANDS,
): Spawnable {
  return platform === 'win32' && shimCommands.includes(command)
    ? { file: [command, ...args].join(' '), argv: [], shell: true }
    : { file: command, argv: args, shell: false }
}

/**
 * Starts, runs and stops the processes a local load-test stack is made of, and
 * remembers what it started so a teardown, or a `down` from another terminal,
 * can stop it.
 */
export class ProcessSupervisor {
  readonly logDir: string
  readonly stateFile: string
  private readonly shimCommands: readonly string[]
  private readonly log: (line: string) => void
  private readonly platform: NodeJS.Platform
  private readonly spawned: { name: string; child: ChildProcess }[] = []

  constructor(options: ProcessSupervisorOptions) {
    this.logDir = options.logDir
    this.stateFile = options.stateFile ?? join(options.logDir, 'stack-state.json')
    this.shimCommands = options.shimCommands ?? DEFAULT_SHIM_COMMANDS
    this.log = options.log ?? writeLine
    this.platform = options.platform ?? process.platform
  }

  private spawnable(command: string, args: string[]): Spawnable {
    return toSpawnable(command, args, this.platform, this.shimCommands)
  }

  /**
   * Starts a long-running process, relays its output line by line with a
   * `[name]` prefix and into `<logDir>/<name>.log`, and keeps it for
   * {@link stopAll}.
   */
  start(name: string, command: string, args: string[], options: SpawnOptions = {}): ChildProcess {
    mkdirSync(this.logDir, { recursive: true })
    const logFile = createWriteStream(join(this.logDir, `${name}.log`), { flags: 'w' })

    const { file, argv, shell } = this.spawnable(command, args)
    const child = spawn(file, argv, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell,
    })
    const relay = (line: string) => {
      if (line.trim() !== '') this.log(`[${name}] ${line.trimEnd()}`)
    }
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue
      stream.setEncoding('utf8')
      // A chunk can end mid-line, so the tail waits for the rest of its line.
      let pending = ''
      stream.on('data', (chunk: string) => {
        logFile.write(chunk)
        const lines = (pending + chunk).split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) relay(line)
      })
      stream.on('end', () => relay(pending))
    }
    child.on('error', (error) => {
      this.log(`[${name}] failed to start: ${error.message}`)
    })
    child.on('close', (code, signal) => {
      logFile.end()
      if (code !== 0 && code !== null) this.log(`[${name}] exited with ${code}`)
      else if (signal) this.log(`[${name}] stopped (${signal})`)
    })

    this.spawned.push({ name, child })
    return child
  }

  /** Runs a command to completion with inherited stdio, and throws when it fails. */
  run(name: string, command: string, args: string[], options: SpawnOptions = {}): void {
    this.log(`[${name}] ${command} ${args.join(' ')}`)
    const { file, argv, shell } = this.spawnable(command, args)
    const result = spawnSync(file, argv, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
      shell,
    })
    if (result.status !== 0) {
      const reason = result.error ? `: ${result.error.message}` : ''
      throw new Error(`${name} failed with exit code ${result.status ?? 'unknown'}${reason}`)
    }
  }

  /**
   * Runs a command with inherited stdio and resolves with its exit code, or 1
   * when it could not start.
   *
   * Asynchronous so this process keeps draining the started processes' output
   * pipes: a child blocked writing to a full pipe stalls mid-run.
   */
  runToExit(command: string, args: string[], options: SpawnOptions = {}): Promise<number> {
    const { file, argv, shell } = this.spawnable(command, args)
    return new Promise<number>((done) => {
      const child = spawn(file, argv, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: 'inherit',
        shell,
      })
      child.on('error', (error) => {
        this.log(`[runner] ${command} failed to start: ${error.message}`)
        done(1)
      })
      child.on('close', (code) => done(code ?? 1))
    })
  }

  /** The started processes that have not exited, in start order. */
  runningProcesses(): RecordedProcess[] {
    return this.spawned.flatMap(({ name, child }) =>
      child.exitCode === null && child.signalCode === null && child.pid
        ? [{ name, pid: child.pid }]
        : [],
    )
  }

  /**
   * Stops `processes` in reverse start order, so a process goes down before
   * whatever it depends on. Defaults to everything this supervisor started.
   */
  stopAll(processes: RecordedProcess[] = this.runningProcesses()): void {
    for (const { name, pid } of [...processes].reverse()) {
      stopProcess(name, pid, { platform: this.platform, log: this.log })
    }
    this.spawned.length = 0
  }

  /** Records the running processes, plus `extra`, for {@link recordedProcesses} to find later. */
  writeState(extra: Record<string, unknown> = {}): void {
    mkdirSync(dirname(this.stateFile), { recursive: true })
    const state: StackState = {
      ...extra,
      startedAt: new Date().toISOString(),
      pids: this.runningProcesses(),
    }
    writeFileSync(this.stateFile, `${JSON.stringify(state, null, 2)}\n`)
  }

  readState(): StackState | undefined {
    if (!existsSync(this.stateFile)) return undefined
    return JSON.parse(readFileSync(this.stateFile, 'utf8')) as StackState
  }

  /**
   * What a `down` from another terminal stops, having started nothing itself:
   * the processes a `--keep` run recorded.
   */
  recordedProcesses(): RecordedProcess[] {
    return (this.readState()?.pids ?? []).filter(({ pid }) => Boolean(pid))
  }

  clearState(): void {
    if (existsSync(this.stateFile)) rmSync(this.stateFile)
  }
}

export type StopProcessOptions = {
  /** @default process.platform */
  platform?: NodeJS.Platform
  /** @default a line on stdout */
  log?: (line: string) => void
}

/**
 * Stops a process and, on Windows, everything under it. A kill there stops only
 * the pid it names, and a process started through a shim is a cmd.exe with the
 * real one below it.
 */
export function stopProcess(name: string, pid: number, options: StopProcessOptions = {}): void {
  const log = options.log ?? writeLine
  log(`[runner] stopping ${name}`)
  if ((options.platform ?? process.platform) === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Already gone.
  }
}
