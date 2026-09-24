import type { ProcessSupervisor } from './processes.ts'

export type ComposeProject = {
  /** Path to the compose file. */
  file: string
  /** The `-p` project name, which keeps this stack's containers apart from any other. */
  project: string
  /** Where `docker compose` runs. Defaults to the current directory. */
  cwd?: string
}

export type ComposeUpOptions = {
  /** Compose profiles to enable, for services that only some runs need. */
  profiles?: string[]
}

export type ComposeDownOptions = {
  /**
   * Pass every profile the file defines. A `down` without a profile leaves that
   * profile's containers running, and the network they hold with them.
   */
  profiles?: string[]
  /** Delete the named volumes too. */
  removeVolumes?: boolean
}

export function composeArgs(
  project: ComposeProject,
  profiles: string[] = [],
  ...rest: string[]
): string[] {
  return [
    'compose',
    '-f',
    project.file,
    '-p',
    project.project,
    ...profiles.flatMap((profile) => ['--profile', profile]),
    ...rest,
  ]
}

export const composeUpArgs = (project: ComposeProject, options: ComposeUpOptions = {}) =>
  composeArgs(project, options.profiles, 'up', '-d', '--wait')

export const composeDownArgs = (project: ComposeProject, options: ComposeDownOptions = {}) =>
  composeArgs(project, options.profiles, 'down', ...(options.removeVolumes ? ['-v'] : []))

/** Starts the containers and waits until every one with a healthcheck reports healthy. */
export function composeUp(
  supervisor: ProcessSupervisor,
  project: ComposeProject,
  options: ComposeUpOptions = {},
): void {
  supervisor.run('docker', 'docker', composeUpArgs(project, options), { cwd: project.cwd })
}

export function composeDown(
  supervisor: ProcessSupervisor,
  project: ComposeProject,
  options: ComposeDownOptions = {},
): void {
  supervisor.run('docker', 'docker', composeDownArgs(project, options), { cwd: project.cwd })
}
