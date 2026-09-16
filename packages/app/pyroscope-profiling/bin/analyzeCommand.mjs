/**
 * Reads a profile out of Pyroscope and prints it, so that a local load test can
 * be analysed without a browser. `analyze.mjs` is the executable around this.
 *
 *   pyroscope-analyze --service my-service
 *   pyroscope-analyze --service my-service --select 'span_name="POST /v1/content/refresh"'
 *   pyroscope-analyze --service my-service --against-from now-30m --against-until now-15m
 *
 * The default output is the flat self-time table, which is the view a Node wall
 * profile can actually support: every `await` resumes in a microtask rooted at
 * the scheduler, so cumulative shares collapse and only self time means
 * anything. See the package README, "Self time is what a Node wall profile can
 * tell you".
 */

/* biome-ignore-all lint/suspicious/noConsole: this is a CLI */

import { writeFileSync } from 'node:fs'

const PROFILE_TYPES = {
  wall: 'wall:wall:nanoseconds:wall:nanoseconds',
  cpu: 'wall:cpu:nanoseconds:wall:nanoseconds',
  samples: 'wall:samples:count:wall:nanoseconds',
  heap: 'memory:inuse_space:bytes:inuse_space:bytes',
  objects: 'memory:inuse_objects:count:inuse_space:bytes',
}

/** Options that take a value. Anything else is rejected rather than ignored. */
const VALUE_OPTIONS = new Set([
  'service',
  'url',
  'type',
  'select',
  'from',
  'until',
  'against-from',
  'against-until',
  'top',
  'min-share',
  'folded',
  'auth-token',
  'basic-auth-user',
  'basic-auth-password',
  'tenant-id',
])

const FLAG_OPTIONS = new Set(['json', 'tree'])

const USAGE = `pyroscope-analyze: print a profile from a local Pyroscope.

  --service <name>        Required. The app name profiles were shipped under.
  --url <url>             Pyroscope base URL. Default PYROSCOPE_SERVER_ADDRESS
                          or http://localhost:4040.
  --type <type>           ${Object.keys(PROFILE_TYPES).join(' | ')}, or a full
                          profile type id. Default wall.
  --select <matchers>     Extra label matchers, e.g. 'job="cache-refresh"' or
                          'span_name="POST /v1/content/refresh"'.
  --from <when>           Start of the range. now-<n>[smh], an ISO timestamp or
                          Unix millis. Default now-15m.
  --until <when>          End of the range. Default now.
  --against-from <when>   Compare against a second range and print the delta
  --against-until <when>  per frame. Both are optional individually: they
                          default to a window of the same length ending where
                          --from starts.
  --top <n>               Frames to print, in the table and in --json.
                          Default 20.
  --tree                  Also print the call tree, indented, one value per
                          line. Use it when the flat table names a frame and
                          the question becomes who called it.
  --min-share <percent>   Frames below this share of the total are left out of
                          the tree. Default 1.
  --json                  Machine-readable output instead of a table. Printed
                          on an empty range too, so a gate can read the total.
  --folded <file>         Also write collapsed stacks, the input format
                          flamegraph.pl and inferno take.

Credentials, for a Pyroscope that is not the local unauthenticated one. Each
defaults to the environment variable the service ships profiles with.

  --auth-token <token>            PYROSCOPE_AUTH_TOKEN. Bearer token, which
                                  takes precedence over basic auth.
  --basic-auth-user <user>        PYROSCOPE_BASIC_AUTH_USER. For Grafana Cloud
                                  Profiles this is the numeric stack id.
  --basic-auth-password <secret>  PYROSCOPE_BASIC_AUTH_PASSWORD.
  --tenant-id <id>                PYROSCOPE_TENANT_ID, sent as X-Scope-OrgID.
`

const UNIT_BY_PROFILE_TYPE = (profileType) => {
  if (profileType.includes(':nanoseconds:')) return 'time'
  if (profileType.includes(':bytes:')) return 'bytes'
  return 'count'
}

/** `--top=5` and `--top 5` are the same option; only the first splits here. */
function splitOption(arg) {
  const separator = arg.indexOf('=')
  if (separator === -1) return { key: arg.slice(2), attached: undefined }
  return { key: arg.slice(2, separator), attached: arg.slice(separator + 1) }
}

/**
 * A flag standing where the value belongs means the value was left out. Taking
 * it anyway is how `--folded --json` ends up writing the collapsed stacks to a
 * file called `--json` and printing the table it was told not to.
 */
function takeValue(key, attached, remaining) {
  const value = attached ?? (remaining[0]?.startsWith('--') ? undefined : remaining.shift())
  if (!value) throw new Error(`--${key} needs a value`)
  return value
}

export function parseArgs(argv) {
  const remaining = [...argv]
  const options = {}
  while (remaining.length > 0) {
    const arg = remaining.shift()
    if (arg === '--help' || arg === '-h') return { help: true }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)

    const { key, attached } = splitOption(arg)
    if (FLAG_OPTIONS.has(key)) {
      if (attached !== undefined) throw new Error(`--${key} takes no value`)
      options[key] = true
    } else if (VALUE_OPTIONS.has(key)) {
      options[key] = takeValue(key, attached, remaining)
    } else {
      throw new Error(`Unknown option: --${key}`)
    }
  }
  return options
}

/** `now`, `now-15m`, an ISO timestamp or Unix millis, to Unix millis. */
export function parseWhen(when, now) {
  if (when === 'now') return now
  const relative = /^now-(\d+)([smh])$/.exec(when)
  if (relative) {
    const multiplier = { s: 1_000, m: 60_000, h: 3_600_000 }[relative[2]]
    return now - Number(relative[1]) * multiplier
  }
  if (/^\d+$/.test(when)) return Number(when)
  const parsed = Date.parse(when)
  if (Number.isNaN(parsed)) throw new Error(`Cannot read a time from "${when}"`)
  return parsed
}

/**
 * A value that has to be a number. Without the check a typo becomes NaN, and
 * every comparison against NaN is false, so the run prints an empty table and
 * exits 0 as if the profile had held nothing.
 */
function parseNumber(value, flag, minimum) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`--${flag} needs a number of at least ${minimum}, got "${value}"`)
  }
  return parsed
}

/**
 * `--service` is a value, so it is quoted and escaped: a name carrying a `"`
 * would otherwise either close the matcher early and query a different series,
 * or produce a selector Pyroscope rejects with a message about its own syntax
 * rather than about the argument. `--select` is matcher syntax by definition
 * and goes through as written.
 */
const buildSelector = (service, select) => {
  const name = JSON.stringify(String(service))
  return select ? `{service_name=${name}, ${select}}` : `{service_name=${name}}`
}

/**
 * The same credentials the service ships profiles with. Reading the address
 * from the environment and not the token would send an unauthenticated request
 * to whatever Grafana Cloud or multi-tenant endpoint that address names.
 */
function buildHeaders(options, env) {
  const headers = { 'content-type': 'application/json' }
  const authToken = options['auth-token'] ?? env.PYROSCOPE_AUTH_TOKEN
  const user = options['basic-auth-user'] ?? env.PYROSCOPE_BASIC_AUTH_USER
  const password = options['basic-auth-password'] ?? env.PYROSCOPE_BASIC_AUTH_PASSWORD
  const tenantId = options['tenant-id'] ?? env.PYROSCOPE_TENANT_ID

  if (authToken) {
    headers.authorization = `Bearer ${authToken}`
  } else if (user || password) {
    const credentials = Buffer.from(`${user ?? ''}:${password ?? ''}`).toString('base64')
    headers.authorization = `Basic ${credentials}`
  }
  if (tenantId) headers['X-Scope-OrgID'] = tenantId
  return headers
}

async function fetchFlamegraph(settings, start, end) {
  const { url, profileType, selector, headers } = settings
  const endpoint = `${url.replace(/\/$/, '')}/querier.v1.QuerierService/SelectMergeStacktraces`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ profileTypeID: profileType, labelSelector: selector, start, end }),
  })
  if (!response.ok) {
    throw new Error(
      `Pyroscope answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
    )
  }
  const body = await response.json()
  if (!body.flamegraph) throw new Error(`Unexpected answer from Pyroscope: ${JSON.stringify(body)}`)
  return body.flamegraph
}

/**
 * A flamebearer level, which Pyroscope sends either as a flat array of numbers
 * or as an object wrapping one. The shape has to be tested rather than defaulted
 * through `??`: `values` on the array form resolves to `Array.prototype.values`,
 * a function with a `length` of 0, which reads as a level holding no nodes.
 */
const levelValues = (level) => (Array.isArray(level) ? level : (level?.values ?? []))

/**
 * Pyroscope returns the flamebearer encoding: one flat array per depth level,
 * four numbers per node, `[offsetFromPreviousSibling, total, self, nameIndex]`.
 * Self time per frame is the sum over every node carrying that name.
 */
export function selfByFrame(flamegraph) {
  const { names = [], levels = [] } = flamegraph
  const self = new Map()
  for (const level of levels) {
    const values = levelValues(level)
    for (let index = 0; index + 3 < values.length; index += 4) {
      const selfValue = Number(values[index + 2])
      if (selfValue === 0) continue
      const name = names[Number(values[index + 3])] ?? '(unknown)'
      self.set(name, (self.get(name) ?? 0) + selfValue)
    }
  }
  return self
}

/**
 * Rebuilds the node tree from the flamebearer levels. A node's parent is the
 * node one level up whose horizontal span contains it, which is what the offset
 * field encodes: each node starts at the previous sibling's end plus its own
 * offset.
 *
 * Both levels come out ordered by `start` and siblings do not overlap, so the
 * parent of each node is at or after the parent of the node before it and one
 * advancing index finds them all. Searching the level above per node instead
 * would be quadratic, on a profile that routinely has thousands of nodes on its
 * hot levels.
 */
export function buildTree(flamegraph) {
  const { names = [], levels = [] } = flamegraph
  const nodesByLevel = levels.map((level) => {
    const values = levelValues(level)
    const nodes = []
    let cursor = 0
    for (let index = 0; index + 3 < values.length; index += 4) {
      const start = cursor + Number(values[index])
      const total = Number(values[index + 1])
      nodes.push({
        start,
        end: start + total,
        total,
        self: Number(values[index + 2]),
        name: names[Number(values[index + 3])] ?? '(unknown)',
        children: [],
      })
      cursor = start + total
    }
    return nodes
  })

  for (let depth = 1; depth < nodesByLevel.length; depth++) {
    const parents = nodesByLevel[depth - 1]
    let parentIndex = 0
    for (const node of nodesByLevel[depth]) {
      while (parentIndex < parents.length && parents[parentIndex].end <= node.start) parentIndex++
      const parent = parents[parentIndex]
      if (parent && parent.start <= node.start) parent.children.push(node)
    }
  }
  return nodesByLevel[0]?.[0]
}

/** `parent;child;grandchild value` lines, the input flamegraph.pl and inferno take. */
export function foldedStacks(root) {
  const lines = []
  const walk = (node, stack) => {
    const path = [...stack, node.name]
    if (node.self > 0) lines.push(`${path.join(';')} ${node.self}`)
    for (const child of node.children) walk(child, path)
  }
  if (root) walk(root, [])
  return lines.join('\n')
}

/** The same tree as plain data, for `--json --tree`. */
export function toJsonTree(node, total, minShare) {
  if (!node || node.total / total < minShare) return undefined
  return {
    name: node.name,
    total: node.total,
    self: node.self,
    share: node.total / total,
    children: [...node.children]
      .sort((a, b) => b.total - a.total)
      .map((child) => toJsonTree(child, total, minShare))
      .filter(Boolean),
  }
}

const formatValue = (value, unit) => {
  if (unit === 'time') {
    const ms = value / 1e6
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`
  }
  if (unit === 'bytes') {
    const mb = value / 1024 / 1024
    return mb >= 1 ? `${mb.toFixed(2)} MiB` : `${(value / 1024).toFixed(1)} KiB`
  }
  return value.toLocaleString('en-US')
}

const formatDelta = (delta, unit) =>
  `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${formatValue(Math.abs(delta), unit)}`

/**
 * The call tree, indented, with a number on every line.
 *
 * Deliberately not an ASCII flame graph. A flame graph encodes its values as
 * rectangle widths, and at terminal resolution that rounds a 3% frame and a 0.3%
 * frame to the same single character, so the picture has to be re-measured
 * against a legend to say anything. An indentation carries the same nesting and
 * every value stays exact, which is also what makes the output quotable in a
 * report or readable by a tool.
 */
function printTree(root, total, unit, minShare) {
  const rows = []
  const walk = (node, depth) => {
    if (node.total / total < minShare) return
    rows.push([
      `${'  '.repeat(depth)}${node.name}`,
      formatValue(node.total, unit),
      `${((node.total / total) * 100).toFixed(1)}%`,
      node.self > 0 ? formatValue(node.self, unit) : '',
    ])
    for (const child of [...node.children].sort((a, b) => b.total - a.total)) {
      walk(child, depth + 1)
    }
  }
  walk(root, 0)
  printTable(rows, ['frame', 'total', 'share', 'self'])
}

function printTable(rows, headers) {
  // Folded rather than spread into `Math.max`: `--tree --min-share 0` on a real
  // profile passes six figures of rows, and one argument per row is past what
  // an engine will take on a call.
  const widths = headers.map((header, column) =>
    rows.reduce((width, row) => Math.max(width, String(row[column]).length), header.length),
  )
  const line = (cells) =>
    cells
      .map((cell, column) =>
        column === 0 ? String(cell).padEnd(widths[column]) : String(cell).padStart(widths[column]),
      )
      .join('  ')
  console.log(line(headers))
  console.log(widths.map((width) => '-'.repeat(width)).join('  '))
  for (const row of rows) console.log(line(row))
}

/** The defaults, and the two shorthands `--type` and `--from` accept. */
export function resolveSettings(options, now, env = process.env) {
  const type = options.type ?? 'wall'
  // Own property only: `PROFILE_TYPES.toString` is a function, truthy, and
  // would be passed on as if it were a profile type id.
  const profileType = Object.hasOwn(PROFILE_TYPES, type) ? PROFILE_TYPES[type] : type
  const from = parseWhen(options.from ?? 'now-15m', now)
  const until = parseWhen(options.until ?? 'now', now)
  return {
    url: options.url ?? env.PYROSCOPE_SERVER_ADDRESS ?? 'http://localhost:4040',
    profileType,
    unit: UNIT_BY_PROFILE_TYPE(profileType),
    selector: buildSelector(options.service, options.select),
    headers: buildHeaders(options, env),
    from,
    until,
    top: parseNumber(options.top ?? 20, 'top', 1),
    minShare: parseNumber(options['min-share'] ?? 1, 'min-share', 0) / 100,
  }
}

/**
 * The second range, when one was asked for. Either bound on its own is enough:
 * the window defaults to the same length as the main one, ending where it
 * starts, which is what "the run before this one" usually means.
 */
async function fetchAgainst(options, settings, now) {
  if (!options['against-from'] && !options['against-until']) return undefined
  const { from, until } = settings
  const againstUntil = parseWhen(options['against-until'] ?? String(from), now)
  const againstFrom = parseWhen(
    options['against-from'] ?? String(againstUntil - (until - from)),
    now,
  )
  const flamegraph = await fetchFlamegraph(settings, againstFrom, againstUntil)
  return {
    from: againstFrom,
    until: againstUntil,
    total: Number(flamegraph.total ?? 0),
    self: selfByFrame(flamegraph),
  }
}

/** Frames by self time, or by how far the two ranges moved apart when diffing. */
export function rankFrames(self, total, against) {
  return [...new Set([...self.keys(), ...(against?.self.keys() ?? [])])]
    .map((name) => ({
      name,
      self: self.get(name) ?? 0,
      share: (self.get(name) ?? 0) / total,
      ...(against ? { against: against.self.get(name) ?? 0 } : {}),
    }))
    .sort((a, b) =>
      against ? Math.abs(b.self - b.against) - Math.abs(a.self - a.against) : b.self - a.self,
    )
}

function printHeader(settings, total, against) {
  const { selector, profileType, unit, from, until } = settings
  console.log(`${selector}  ${profileType}`)
  console.log(
    `${new Date(from).toISOString()} to ${new Date(until).toISOString()}: ${formatValue(total, unit)} total`,
  )
  if (against) {
    console.log(
      `against ${new Date(against.from).toISOString()} to ${new Date(against.until).toISOString()}: ${formatValue(against.total, unit)} total (${formatDelta(total - against.total, unit)})`,
    )
  }
  console.log('')
}

function printFrames(frames, settings, against) {
  const { unit, top } = settings
  const rows = frames
    .slice(0, top)
    .map((frame) => [
      frame.name,
      formatValue(frame.self, unit),
      `${(frame.share * 100).toFixed(1)}%`,
      ...(against ? [formatDelta(frame.self - frame.against, unit)] : []),
    ])
  printTable(rows, [
    'frame (self)',
    unit === 'time' ? 'self' : 'value',
    'share',
    ...(against ? ['delta'] : []),
  ])
  if (frames.length > top) {
    console.log(`
${frames.length - top} more frames. Raise --top to see them.`)
  }
}

function reportEmpty(settings) {
  const { selector, profileType, from, until } = settings
  console.error(
    `No samples for ${selector} of type ${profileType} between ${new Date(from).toISOString()} and ${new Date(until).toISOString()}.`,
  )
  console.error(
    'A profile arrives one PYROSCOPE_FLUSH_INTERVAL_MS after the process starts, 60s by default,',
  )
  console.error('and a Pyroscope that has just come up drops what it is sent in its first minute.')
}

/**
 * A profile with a total and no readable node means the answer came back in a
 * shape this tool does not know, which is worth saying rather than printing an
 * empty table over it.
 */
function reportUnreadable(settings, total) {
  const { selector, unit } = settings
  console.error(
    `Pyroscope reported ${formatValue(total, unit)} for ${selector} but no frames could be read from its answer.`,
  )
}

/**
 * The same report as the table, in the same shape whether or not there was
 * anything to print: a gate that reads this has to be able to tell an empty
 * range from a failure, and prose on standard error is not something `jq` can
 * answer that from.
 */
function printJson(options, settings, report) {
  const { selector, profileType, unit, from, until, top, minShare } = settings
  const { total, against, frames, root } = report
  console.log(
    JSON.stringify(
      {
        selector,
        profileType,
        unit,
        from,
        until,
        total,
        against: against?.total,
        frameCount: frames.length,
        frames: frames.slice(0, top),
        ...(options.tree ? { tree: toJsonTree(root, total, minShare) } : {}),
      },
      null,
      2,
    ),
  )
}

function printReport(options, settings, report) {
  const { unit, minShare } = settings
  const { total, against, frames, root } = report

  printHeader(settings, total, against)
  printFrames(frames, settings, against)

  if (options.tree && root) {
    console.log(`
call tree, frames under ${(minShare * 100).toFixed(1)}% of the total omitted:
`)
    printTree(root, total, unit, minShare)
  }
  if (options.folded) {
    console.log(`
Collapsed stacks written to ${options.folded}.`)
  }
}

/**
 * @returns the exit code: 0 printed a profile, 1 was misused, 2 found nothing
 * to print. Exit 2 still writes the report under `--json`, with the reason on
 * standard error.
 */
export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv)
  if (options.help || !options.service) {
    console.log(USAGE)
    return options.help ? 0 : 1
  }

  const now = Date.now()
  const settings = resolveSettings(options, now, env)

  const flamegraph = await fetchFlamegraph(settings, settings.from, settings.until)
  const total = Number(flamegraph.total ?? 0)
  if (total === 0) {
    if (options.json) printJson(options, settings, { total: 0, frames: [] })
    reportEmpty(settings)
    return 2
  }

  const against = await fetchAgainst(options, settings, now)
  const frames = rankFrames(selfByFrame(flamegraph), total, against)
  if (frames.length === 0) {
    if (options.json) printJson(options, settings, { total, frames: [] })
    reportUnreadable(settings, total)
    return 2
  }

  // Built once even when --tree and --folded both want it.
  const root = options.tree || options.folded ? buildTree(flamegraph) : undefined
  const report = { total, against, frames, root }
  if (options.folded) {
    writeFileSync(
      options.folded,
      `${foldedStacks(root)}
`,
    )
  }

  if (options.json) {
    printJson(options, settings, report)
    return 0
  }
  printReport(options, settings, report)
  return 0
}
