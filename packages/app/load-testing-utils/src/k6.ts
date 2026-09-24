import { spawnSync } from 'node:child_process'
import { isAbsolute, posix, relative, resolve, sep } from 'node:path'
import type { ProcessSupervisor } from './processes.ts'

export type K6Mode = 'auto' | 'local' | 'docker'
export type ResolvedK6Mode = Exclude<K6Mode, 'auto'>

export const DEFAULT_K6_IMAGE = 'grafana/k6:latest'

/** How a container reaches a port on the host. */
export const DOCKER_HOST_ALIAS = 'host.docker.internal'

const hasLocalK6 = (): boolean =>
  spawnSync('k6', ['version'], { stdio: 'ignore', shell: false }).status === 0

/** `auto` becomes `local` when a `k6` binary answers on PATH, and `docker` otherwise. */
export function resolveK6Mode(mode: K6Mode, isK6Installed = hasLocalK6): ResolvedK6Mode {
  if (mode !== 'auto') return mode
  return isK6Installed() ? 'local' : 'docker'
}

/** The host name k6 uses to reach a service running on this machine. */
export const k6TargetHost = (mode: ResolvedK6Mode): string =>
  mode === 'docker' ? DOCKER_HOST_ALIAS : 'localhost'

/**
 * Bind-address variables for the processes k6 will call: loopback, unless k6
 * runs in Docker. A container reaches the host through `host.docker.internal`,
 * which on Linux cannot see a socket bound to 127.0.0.1. A variable already
 * exported in `env` is left out, so the shell keeps the last word.
 */
export function bindAddressEnv(
  mode: ResolvedK6Mode,
  variables: string[],
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const address = mode === 'docker' ? '0.0.0.0' : '127.0.0.1'
  return Object.fromEntries(
    variables.filter((key) => env[key] === undefined).map((key) => [key, address]),
  )
}

export type K6DockerOptions = {
  /** Host directory mounted into the container. Has to contain `cwd` and the script. */
  hostDir: string
  /** @default '/k6' */
  containerDir?: string
  /** @default {@link DEFAULT_K6_IMAGE} */
  image?: string
}

export type K6RunOptions = {
  mode: ResolvedK6Mode
  /** Where k6 runs. In Docker, the same directory inside the mount. */
  cwd: string
  /** The script, relative to `cwd` or absolute. */
  script: string
  /** Handed to `k6 run` before the script. */
  args?: string[]
  /**
   * Variables for the script's `__ENV`: the process environment for a local
   * k6, `-e` flags for a container, which sees nothing of this shell.
   */
  env?: Record<string, string>
  /** Required when `mode` is `docker`. */
  docker?: K6DockerOptions
}

export type K6Command = {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

const toContainerPath = (hostDir: string, containerDir: string, path: string): string => {
  const inside = relative(hostDir, path)
  // On Windows a path on another drive has no relative form and comes back absolute.
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`${path} is outside the directory mounted into the k6 container (${hostDir})`)
  }
  return posix.join(containerDir, ...inside.split(sep).filter((part) => part !== ''))
}

/**
 * The command that runs `options.script`. A containerised k6 pays an extra
 * network hop per request, so read a Docker run's latencies against other
 * Docker runs.
 */
export function buildK6Command(options: K6RunOptions): K6Command {
  const args = options.args ?? []
  const env = options.env ?? {}

  if (options.mode === 'local') {
    return { command: 'k6', args: ['run', ...args, options.script], cwd: options.cwd, env }
  }

  if (!options.docker) throw new Error('k6 in docker mode needs the docker options')
  const { containerDir = '/k6', image = DEFAULT_K6_IMAGE } = options.docker
  // `docker run -v` does not take a relative path as a bind mount.
  const hostDir = resolve(options.docker.hostDir)
  const workdir = toContainerPath(hostDir, containerDir, resolve(options.cwd))
  const script = toContainerPath(hostDir, containerDir, resolve(options.cwd, options.script))

  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '-i',
      '--add-host',
      `${DOCKER_HOST_ALIAS}:host-gateway`,
      '-v',
      `${hostDir}:${containerDir}`,
      '-w',
      workdir,
      ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
      image,
      'run',
      ...args,
      script,
    ],
    cwd: options.cwd,
    env: {},
  }
}

/** Runs k6 and resolves with its exit code, which is non-zero when a threshold failed. */
export function runK6(supervisor: ProcessSupervisor, options: K6RunOptions): Promise<number> {
  const { command, args, cwd, env } = buildK6Command(options)
  return supervisor.runToExit(command, args, { cwd, env })
}
