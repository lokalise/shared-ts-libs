import type { K6Mode } from './k6.ts'

export type RunnerArgsSpec<Command extends string, Flag extends string> = {
  commands: readonly Command[]
  /** Used when argv is empty. @default the first of `commands` */
  defaultCommand?: Command
  /**
   * Boolean flags and their defaults, keyed in camelCase: `purgeProfiles`
   * answers to `--purge-profiles` and `--no-purge-profiles`.
   */
  flags: Record<Flag, boolean>
  /** Appended to the error for an unknown command. */
  help?: string
}

export type RunnerArgs<Command extends string, Flag extends string> = {
  command: Command
  flags: Record<Flag, boolean>
  k6Mode: K6Mode
  /** Everything not claimed above, in order, for `k6 run`. */
  passthrough: string[]
}

const toKebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/**
 * Parses `<command> [flags] [k6 args]` for a stack runner. A flag this spec does
 * not declare is not an error: it goes to `passthrough`, so
 * `run -e JOURNEYS=search --vus 5` reaches k6 as it stands.
 */
export function parseRunnerArgs<Command extends string, Flag extends string>(
  argv: string[],
  spec: RunnerArgsSpec<Command, Flag>,
): RunnerArgs<Command, Flag> {
  const [first, ...rest] = argv
  const command = (first ?? spec.defaultCommand ?? spec.commands[0]) as Command
  if (!spec.commands.includes(command)) {
    throw new Error(`unknown command "${command}"${spec.help ? `\n${spec.help}` : ''}`)
  }

  const flags = { ...spec.flags }
  const byName = new Map<string, [Flag, boolean]>()
  for (const flag of Object.keys(spec.flags) as Flag[]) {
    byName.set(`--${toKebab(flag)}`, [flag, true])
    byName.set(`--no-${toKebab(flag)}`, [flag, false])
  }

  let k6Mode: K6Mode = 'auto'
  const passthrough: string[] = []

  for (const arg of rest) {
    const flag = byName.get(arg)
    if (flag) {
      flags[flag[0]] = flag[1]
      continue
    }
    if (arg === '--k6=local' || arg === '--k6=docker' || arg === '--k6=auto') {
      k6Mode = arg.slice('--k6='.length) as K6Mode
      continue
    }
    // pnpm's separator on its way through. Harmless to k6, but noise.
    if (arg === '--') continue
    passthrough.push(arg)
  }

  return { command, flags, k6Mode, passthrough }
}

/**
 * Picks `--name=value` arguments meant for another tool out of the k6
 * passthrough. `taken` is in the `--name value` form most arg parsers read, and
 * `rest` must not carry them: k6 exits on the first flag it does not know.
 */
export function splitValueArgs(
  args: string[],
  names: string[],
): { taken: string[]; rest: string[] } {
  const taken: string[] = []
  const rest: string[] = []
  for (const arg of args) {
    const name = names.find((candidate) => arg.startsWith(`--${candidate}=`))
    if (name === undefined) {
      rest.push(arg)
      continue
    }
    taken.push(`--${name}`, arg.slice(name.length + 3))
  }
  return { taken, rest }
}
