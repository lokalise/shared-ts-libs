import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

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

export type RecordedProcess = {
  name: string
  pid: number
  /** As {@link processStartTime} reported it when the state was written. */
  startTime?: string
}

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

export type LocalBinOptions = {
  /** Where the lookup starts: `node_modules` here, then in every parent. */
  from: string
  /** @default the package name without its scope */
  bin?: string
  /** @default process.execPath */
  node?: string
}

export type LocalBinCommand = { command: string; args: string[] }

/**
 * The command that runs a package's bin with Node directly, which is what
 * `npx <bin>` does without needing npm installed. No `.cmd` shim is involved
 * on Windows, so the command spawns without a shell and its arguments may
 * contain spaces.
 */
export function localBin(
  packageName: string,
  args: string[],
  options: LocalBinOptions,
): LocalBinCommand {
  const binName = options.bin ?? packageName.replace(/^@[^/]+\//, '')
  const packageDir = findPackageDir(packageName, options.from)
  const entry = binEntry(readBinField(packageDir), binName)
  if (!entry) throw new Error(`${packageName} has no "${binName}" bin`)
  return { command: options.node ?? process.execPath, args: [join(packageDir, entry), ...args] }
}

function findPackageDir(packageName: string, from: string): string {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const packageDir = join(dir, 'node_modules', packageName)
    if (existsSync(join(packageDir, 'package.json'))) return packageDir
    if (dirname(dir) === dir) {
      throw new Error(`${packageName} is not installed in or above ${from}`)
    }
  }
}

type BinField = string | Record<string, string> | undefined

const readBinField = (packageDir: string): BinField =>
  (JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { bin?: BinField }).bin

/** The named bin, or the only one when the package declares a single bin under another name. */
function binEntry(bin: BinField, binName: string): string | undefined {
  if (typeof bin === 'string' || bin === undefined) return bin
  const entries = Object.values(bin)
  return bin[binName] ?? (entries.length === 1 ? entries[0] : undefined)
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
      pids: this.runningProcesses().map((recorded) => ({
        ...recorded,
        startTime: processStartTime(recorded.pid, this.platform),
      })),
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
   *
   * A state file can outlive its processes (a crash, a reboot) and the OS then
   * hands their pids to something else, so a pid is kept only while its
   * process still has the start time recorded for it.
   */
  recordedProcesses(): RecordedProcess[] {
    return (this.readState()?.pids ?? []).filter(({ name, pid, startTime }) => {
      if (!pid) return false
      if (startTime !== undefined && processStartTime(pid, this.platform) === startTime) return true
      this.log(`[runner] skipping ${name}: pid ${pid} is no longer the process this stack started`)
      return false
    })
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
 * When `pid` started, as the OS reports it, or `undefined` when no such process
 * exists. Only ever compared with another value from this function on the same
 * machine, so the format does not matter.
 */
export function processStartTime(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  const result =
    platform === 'win32'
      ? spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`,
          ],
          { encoding: 'utf8' },
        )
      : spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
          encoding: 'utf8',
          env: { ...process.env, LC_ALL: 'C' },
        })
  const startTime = result.status === 0 ? (result.stdout ?? '').trim() : ''
  return startTime === '' ? undefined : startTime
}

/** Every process under `pid`, deepest first. Empty when `pgrep` is missing. */
function descendants(pid: number): number[] {
  const { stdout } = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
  return (stdout ?? '')
    .split('\n')
    .map(Number)
    .filter((child) => Number.isInteger(child) && child > 0)
    .flatMap((child) => [...descendants(child), child])
}

/**
 * Stops a process and everything under it. Killing only the pid would leave
 * the real server running when it was started through `npx`, `pnpm` or, on
 * Windows, a cmd.exe shim.
 *
 * On POSIX the tree is walked rather than started as its own process group
 * (`detached`), so a Ctrl+C in the terminal still reaches every process.
 */
export function stopProcess(name: string, pid: number, options: StopProcessOptions = {}): void {
  const log = options.log ?? writeLine
  log(`[runner] stopping ${name}`)
  if ((options.platform ?? process.platform) === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  for (const target of [...descendants(pid), pid]) {
    try {
      process.kill(target, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
}
