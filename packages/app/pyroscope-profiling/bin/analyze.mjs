#!/usr/bin/env node
/**
 * Reads a profile out of Pyroscope and prints it, so that a local load test can
 * be analysed without a browser.
 *
 *   pyroscope-analyze --service my-service
 *   pyroscope-analyze --service my-service --select 'job="cache-refresh"'
 *   pyroscope-analyze --service my-service --against-from now-30m --against-until now-15m
 *
 * The default output is the flat self-time table, which is the view a Node wall
 * profile can actually support: every `await` resumes in a microtask rooted at
 * the scheduler, so cumulative shares collapse and only self time means
 * anything. See the package README, "Self time is what a Node wall profile can
 * tell you".
 */

/* biome-ignore-all lint/suspicious/noConsole: this is a CLI */

const PROFILE_TYPES = {
  wall: 'wall:wall:nanoseconds:wall:nanoseconds',
  cpu: 'wall:cpu:nanoseconds:wall:nanoseconds',
  samples: 'wall:samples:count:wall:nanoseconds',
  heap: 'memory:inuse_space:bytes:inuse_space:bytes',
  objects: 'memory:inuse_objects:count:inuse_space:bytes',
}

const USAGE = `pyroscope-analyze: print a profile from a local Pyroscope.

  --service <name>        Required. The app name profiles were shipped under.
  --url <url>             Pyroscope base URL. Default PYROSCOPE_SERVER_ADDRESS
                          or http://localhost:4040.
  --type <type>           ${Object.keys(PROFILE_TYPES).join(' | ')}, or a full
                          profile type id. Default wall.
  --select <matchers>     Extra label matchers, e.g. 'job="cache-refresh"' or
                          'env="load", instance="abc"'.
  --from <when>           Start of the range. now-<n>[smh], an ISO timestamp or
                          Unix millis. Default now-15m.
  --until <when>          End of the range. Default now.
  --against-from <when>   Compare against a second range and print the delta
  --against-until <when>  per frame. Both are optional individually: they
                          default to a window of the same length ending where
                          --from starts.
  --top <n>               Rows to print. Default 20.
  --tree                  Also print the call tree, indented, one value per
                          line. Use it when the flat table names a frame and
                          the question becomes who called it.
  --min-share <percent>   Frames below this share of the total are left out of
                          the tree. Default 1.
  --json                  Machine-readable output instead of a table.
  --folded <file>         Also write collapsed stacks, the input format
                          flamegraph.pl and inferno take.
`

const UNIT_BY_PROFILE_TYPE = (profileType) => {
  if (profileType.includes(':nanoseconds:')) return 'time'
  if (profileType.includes(':bytes:')) return 'bytes'
  return 'count'
}

function parseArgs(argv) {
  const remaining = [...argv]
  const options = {}
  while (remaining.length > 0) {
    const arg = remaining.shift()
    if (arg === '--help' || arg === '-h') return { help: true }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const key = arg.slice(2)
    if (key === 'json' || key === 'tree') {
      options[key] = true
      continue
    }
    if (remaining.length === 0) throw new Error(`--${key} needs a value`)
    options[key] = remaining.shift()
  }
  return options
}

/** `now`, `now-15m`, an ISO timestamp or Unix millis, to Unix millis. */
function parseWhen(when, now) {
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

const buildSelector = (service, select) =>
  select ? `{service_name="${service}", ${select}}` : `{service_name="${service}"}`

async function fetchFlamegraph(url, profileType, selector, start, end) {
  const endpoint = `${url.replace(/\/$/, '')}/querier.v1.QuerierService/SelectMergeStacktraces`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
 * Pyroscope returns the flamebearer encoding: one flat array per depth level,
 * four numbers per node, `[offsetFromPreviousSibling, total, self, nameIndex]`.
 * Self time per frame is the sum over every node carrying that name.
 */
function selfByFrame(flamegraph) {
  const { names = [], levels = [] } = flamegraph
  const self = new Map()
  for (const level of levels) {
    const values = level.values ?? level
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
 */
function buildTree(flamegraph) {
  const { names = [], levels = [] } = flamegraph
  const nodesByLevel = levels.map((level) => {
    const values = level.values ?? level
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
    for (const node of nodesByLevel[depth]) {
      const parent = nodesByLevel[depth - 1].find(
        (it) => it.start <= node.start && node.start < it.end,
      )
      if (parent) parent.children.push(node)
    }
  }
  return nodesByLevel[0]?.[0]
}

/** `parent;child;grandchild value` lines, the input flamegraph.pl and inferno take. */
function foldedStacks(flamegraph) {
  const lines = []
  const walk = (node, stack) => {
    const path = [...stack, node.name]
    if (node.self > 0) lines.push(`${path.join(';')} ${node.self}`)
    for (const child of node.children) walk(child, path)
  }
  const root = buildTree(flamegraph)
  if (root) walk(root, [])
  return lines.join('\n')
}

/** The same tree as plain data, for `--json --tree`. */
function toJsonTree(node, total, minShare) {
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
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column]).length)),
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
function resolveSettings(options, now) {
  const profileType = PROFILE_TYPES[options.type ?? 'wall'] ?? options.type
  const from = parseWhen(options.from ?? 'now-15m', now)
  const until = parseWhen(options.until ?? 'now', now)
  return {
    url: options.url ?? process.env.PYROSCOPE_SERVER_ADDRESS ?? 'http://localhost:4040',
    profileType,
    unit: UNIT_BY_PROFILE_TYPE(profileType),
    selector: buildSelector(options.service, options.select),
    from,
    until,
    top: Number(options.top ?? 20),
    minShare: Number(options['min-share'] ?? 1) / 100,
  }
}

/**
 * The second range, when one was asked for. Either bound on its own is enough:
 * the window defaults to the same length as the main one, ending where it
 * starts, which is what "the run before this one" usually means.
 */
async function fetchAgainst(options, settings, now) {
  if (!options['against-from'] && !options['against-until']) return undefined
  const { url, profileType, selector, from, until } = settings
  const againstUntil = parseWhen(options['against-until'] ?? String(from), now)
  const againstFrom = parseWhen(
    options['against-from'] ?? String(againstUntil - (until - from)),
    now,
  )
  const flamegraph = await fetchFlamegraph(url, profileType, selector, againstFrom, againstUntil)
  return {
    from: againstFrom,
    until: againstUntil,
    total: Number(flamegraph.total ?? 0),
    self: selfByFrame(flamegraph),
  }
}

/** Frames by self time, or by how far the two ranges moved apart when diffing. */
function rankFrames(self, total, against) {
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help || !options.service) {
    console.log(USAGE)
    process.exit(options.service ? 0 : 1)
  }

  const now = Date.now()
  const settings = resolveSettings(options, now)
  const { url, profileType, selector, unit, from, until, minShare } = settings

  const flamegraph = await fetchFlamegraph(url, profileType, selector, from, until)
  const total = Number(flamegraph.total ?? 0)
  if (total === 0) {
    reportEmpty(settings)
    process.exit(2)
  }

  const against = await fetchAgainst(options, settings, now)
  const frames = rankFrames(selfByFrame(flamegraph), total, against)

  if (options.folded) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      options.folded,
      `${foldedStacks(flamegraph)}
`,
    )
  }

  if (options.json) {
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
          frames,
          ...(options.tree ? { tree: toJsonTree(buildTree(flamegraph), total, minShare) } : {}),
        },
        null,
        2,
      ),
    )
    return
  }

  printHeader(settings, total, against)
  printFrames(frames, settings, against)

  if (options.tree) {
    console.log(
      `
call tree, frames under ${(minShare * 100).toFixed(1)}% of the total omitted:
`,
    )
    const root = buildTree(flamegraph)
    if (root) printTree(root, total, unit, minShare)
  }
  if (options.folded) {
    console.log(`
Collapsed stacks written to ${options.folded}.`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
