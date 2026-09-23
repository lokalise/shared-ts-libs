import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildTree,
  foldedStacks,
  main,
  parseArgs,
  parseWhen,
  rankFrames,
  resolveSettings,
  selfByFrame,
  toJsonTree,
} from './analyzeCommand.mjs'

const NOW = Date.parse('2026-09-16T12:00:00.000Z')

/**
 * The flamebearer encoding as Pyroscope sends it: one flat array per depth
 * level, four numbers per node, `[offsetFromPreviousSibling, total, self,
 * nameIndex]`. One second of wall time, split between a frame with a child and
 * a garbage collection frame.
 */
const FLAMEGRAPH = {
  names: ['total', 'run', 'gc', 'inner'],
  levels: [
    [0, 1e9, 0, 0],
    [0, 9e8, 4e8, 1, 0, 1e8, 1e8, 2],
    [0, 5e8, 5e8, 3],
  ],
  total: 1e9,
}

const respondWith = (flamegraph) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ flamegraph }),
  text: () => Promise.resolve(''),
})

describe('parseArgs', () => {
  it('reads values, flags and the two spellings of help', () => {
    expect(parseArgs(['--service', 'my-service', '--tree', '--top', '5'])).toEqual({
      service: 'my-service',
      tree: true,
      top: '5',
    })
    expect(parseArgs(['--help'])).toEqual({ help: true })
    expect(parseArgs(['-h', '--service', 'my-service'])).toEqual({
      help: true,
      service: 'my-service',
    })
  })

  // A mistyped flag used to be accepted and then silently ignored, which reads
  // as the tool disagreeing with the profile rather than with the command line.
  it('refuses an option it does not know, and one without a value', () => {
    expect(() => parseArgs(['--tre'])).toThrow("Unknown option '--tre'")
    expect(() => parseArgs(['--service'])).toThrow("Option '--service <value>' argument missing")
    expect(() => parseArgs(['my-service'])).toThrow("Unexpected argument 'my-service'")
  })

  // `--folded --json` used to write the collapsed stacks to a file called
  // `--json` and print the table, which reads as the tool ignoring both.
  it('refuses a flag standing where a value belongs', () => {
    expect(() => parseArgs(['--folded', '--json'])).toThrow(
      "Option '--folded' argument is ambiguous",
    )
    expect(() => parseArgs(['--select', '--tree'])).toThrow(
      "Option '--select' argument is ambiguous",
    )
  })

  it('takes a value attached with =, and refuses one on a flag', () => {
    expect(parseArgs(['--top=5', '--select=job="cache-refresh"', '--json'])).toEqual({
      top: '5',
      select: 'job="cache-refresh"',
      json: true,
    })
    expect(() => parseArgs(['--json=true'])).toThrow("Option '--json' does not take an argument")
    expect(() => parseArgs(['--service='])).toThrow('--service needs a value')
  })
})

describe('parseWhen', () => {
  it('reads the four shapes a bound can take', () => {
    expect(parseWhen('now', NOW)).toBe(NOW)
    expect(parseWhen('now-15m', NOW)).toBe(NOW - 900_000)
    expect(parseWhen('now-2h', NOW)).toBe(NOW - 7_200_000)
    expect(parseWhen('2026-09-16T11:00:00.000Z', NOW)).toBe(NOW - 3_600_000)
    expect(parseWhen(String(NOW), NOW)).toBe(NOW)
  })

  it('refuses a time it cannot read', () => {
    expect(() => parseWhen('yesterday', NOW)).toThrow('Cannot read a time from "yesterday"')
  })
})

describe('resolveSettings', () => {
  it('defaults to the last fifteen minutes of wall time on a local Pyroscope', () => {
    const settings = resolveSettings({ service: 'my-service' }, NOW, {})

    expect(settings).toMatchObject({
      url: 'http://localhost:4040',
      profileType: 'wall:wall:nanoseconds:wall:nanoseconds',
      unit: 'time',
      selector: '{service_name="my-service"}',
      from: NOW - 900_000,
      until: NOW,
      top: 20,
      minShare: 0.01,
    })
  })

  it('takes the shorthands, and passes a full profile type id through', () => {
    expect(resolveSettings({ service: 'x', type: 'heap' }, NOW, {}).unit).toBe('bytes')
    expect(resolveSettings({ service: 'x', type: 'samples' }, NOW, {}).unit).toBe('count')
    expect(
      resolveSettings({ service: 'x', type: 'block:delay:nanoseconds:x:y' }, NOW, {}),
    ).toMatchObject({ profileType: 'block:delay:nanoseconds:x:y' })
  })

  // `memory:inuse_objects:count:inuse_space:bytes` is sampled per byte
  // allocated and counts objects, so reading its unit off the period would
  // print a number of objects as MiB.
  it('reads the unit off the sample and not off the period', () => {
    expect(resolveSettings({ service: 'x', type: 'objects' }, NOW, {}).unit).toBe('count')
  })

  // `PROFILE_TYPES.toString` is inherited, a function and truthy, so a lookup
  // that does not check ownership hands a function on as a profile type id.
  it('does not mistake an inherited member of the shorthand table for a type', () => {
    expect(resolveSettings({ service: 'x', type: 'toString' }, NOW, {})).toMatchObject({
      profileType: 'toString',
      unit: 'count',
    })
  })

  // NaN compares false against everything, so an unchecked number empties the
  // output and still exits 0.
  it('refuses a numeric option that is not a number', () => {
    expect(() => resolveSettings({ service: 'x', top: 'abc' }, NOW, {})).toThrow(
      '--top needs a number of at least 1, got "abc"',
    )
    expect(() => resolveSettings({ service: 'x', 'min-share': 'abc' }, NOW, {})).toThrow(
      '--min-share needs a number of at least 0',
    )
    expect(() => resolveSettings({ service: 'x', top: '0' }, NOW, {})).toThrow('--top needs')
    expect(() => resolveSettings({ service: 'x', timeout: 'abc' }, NOW, {})).toThrow(
      '--timeout needs a number of at least 1',
    )
  })

  // An inverted range comes back empty, and the empty report then points at
  // ingest ("a profile arrives one flush interval after the process starts")
  // for what a transposed pair of arguments did.
  it('refuses a range that runs backwards', () => {
    expect(() => resolveSettings({ service: 'x', from: 'now', until: 'now-15m' }, NOW, {})).toThrow(
      '--from has to come before --until',
    )
    expect(() => resolveSettings({ service: 'x', until: 'now-15m' }, NOW, {})).toThrow(
      '--from has to come before --until',
    )
  })

  it('bounds the request, in seconds, at thirty by default', () => {
    expect(resolveSettings({ service: 'x' }, NOW, {}).timeoutMs).toBe(30_000)
    expect(resolveSettings({ service: 'x', timeout: '5' }, NOW, {}).timeoutMs).toBe(5_000)
  })

  it('adds the extra matchers to the selector', () => {
    expect(
      resolveSettings({ service: 'my-service', select: 'span_name="GET /v1/env"' }, NOW, {})
        .selector,
    ).toBe('{service_name="my-service", span_name="GET /v1/env"}')
  })

  // An unescaped name closes the matcher early, and the query that comes back
  // is a different series rather than an error anyone would notice.
  it('escapes a service name instead of letting it rewrite the selector', () => {
    expect(
      resolveSettings({ service: 'my-service"} or {service_name="other' }, NOW, {}).selector,
    ).toBe('{service_name="my-service\\"} or {service_name=\\"other"}')
  })

  describe('credentials', () => {
    it('sends the bearer token the service ships profiles with', () => {
      const { headers } = resolveSettings({ service: 'x' }, NOW, {
        PYROSCOPE_AUTH_TOKEN: 'token',
        PYROSCOPE_TENANT_ID: 'lokalise',
      })

      expect(headers).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer token',
        'X-Scope-OrgID': 'lokalise',
      })
    })

    it('sends basic auth, which is what Grafana Cloud Profiles wants', () => {
      const { headers } = resolveSettings({ service: 'x' }, NOW, {
        PYROSCOPE_BASIC_AUTH_USER: '123456',
        PYROSCOPE_BASIC_AUTH_PASSWORD: 'glc_secret',
      })

      expect(headers.authorization).toBe(`Basic ${btoa('123456:glc_secret')}`)
    })

    it('lets a flag override the environment, and prefers the token over basic auth', () => {
      const { headers, url } = resolveSettings(
        { service: 'x', 'auth-token': 'from-flag', 'tenant-id': 'other' },
        NOW,
        {
          PYROSCOPE_AUTH_TOKEN: 'from-env',
          PYROSCOPE_BASIC_AUTH_USER: '123456',
          PYROSCOPE_SERVER_ADDRESS: 'https://profiles.example',
        },
      )

      expect(headers.authorization).toBe('Bearer from-flag')
      expect(headers['X-Scope-OrgID']).toBe('other')
      expect(url).toBe('https://profiles.example')
    })

    it('sends none on the local unauthenticated Pyroscope', () => {
      expect(resolveSettings({ service: 'x' }, NOW, {}).headers).toEqual({
        'content-type': 'application/json',
      })
    })
  })
})

describe('selfByFrame', () => {
  it('sums self time per frame across the levels', () => {
    expect([...selfByFrame(FLAMEGRAPH)]).toEqual([
      ['run', 4e8],
      ['gc', 1e8],
      ['inner', 5e8],
    ])
  })

  // Pyroscope has shipped both shapes, and `level.values` on the array form is
  // Array.prototype.values: a function, so an unchecked fallback reads every
  // level as empty and prints a profile with no frames in it.
  it('reads a level wrapped in an object as well as a flat array', () => {
    const wrapped = { ...FLAMEGRAPH, levels: FLAMEGRAPH.levels.map((values) => ({ values })) }

    expect([...selfByFrame(wrapped)]).toEqual([...selfByFrame(FLAMEGRAPH)])
  })

  it('names a frame the profile does not carry a name for', () => {
    expect([...selfByFrame({ names: [], levels: [[0, 10, 10, 7]] })]).toEqual([['(unknown)', 10]])
  })
})

describe('buildTree', () => {
  it('nests each node under the node above it that its span falls into', () => {
    const root = buildTree(FLAMEGRAPH)

    expect(root).toMatchObject({ name: 'total', total: 1e9 })
    expect(root.children.map((child) => child.name)).toEqual(['run', 'gc'])
    expect(root.children[0].children.map((child) => child.name)).toEqual(['inner'])
    expect(root.children[1].children).toEqual([])
  })

  it('finds the parent of a node that starts after several siblings', () => {
    const root = buildTree({
      names: ['total', 'first', 'second', 'deep'],
      levels: [
        [0, 1e9, 0, 0],
        [0, 3e8, 3e8, 1, 0, 7e8, 2e8, 2],
        [3e8, 5e8, 5e8, 3],
      ],
      total: 1e9,
    })

    expect(root.children[0].children).toEqual([])
    expect(root.children[1].children.map((child) => child.name)).toEqual(['deep'])
  })

  it('has no root to return for a profile with no levels', () => {
    expect(buildTree({})).toBeUndefined()
  })
})

describe('foldedStacks', () => {
  it('writes one line per frame that spent time, with its path', () => {
    expect(foldedStacks(buildTree(FLAMEGRAPH))).toBe(
      ['total;run 400000000', 'total;run;inner 500000000', 'total;gc 100000000'].join('\n'),
    )
  })

  it('is empty without a tree', () => {
    expect(foldedStacks(undefined)).toBe('')
  })
})

describe('toJsonTree', () => {
  it('orders children by size and leaves out what is under the minimum share', () => {
    const tree = toJsonTree(buildTree(FLAMEGRAPH), 1e9, 0.2)

    expect(tree.children.map((child) => child.name)).toEqual(['run'])
    expect(tree.children[0]).toMatchObject({ total: 9e8, self: 4e8, share: 0.9 })
  })
})

describe('rankFrames', () => {
  it('orders by self time', () => {
    expect(rankFrames(selfByFrame(FLAMEGRAPH), 1e9).map((frame) => frame.name)).toEqual([
      'inner',
      'run',
      'gc',
    ])
  })

  it('orders by how far the two ranges moved apart when diffing', () => {
    const against = { self: new Map([['run', 9e8]]) }

    const frames = rankFrames(selfByFrame(FLAMEGRAPH), 1e9, against)

    expect(frames.map((frame) => frame.name)).toEqual(['run', 'inner', 'gc'])
    expect(frames[0]).toMatchObject({ self: 4e8, against: 9e8 })
  })
})

describe('main', () => {
  let out
  let errors

  beforeEach(() => {
    out = []
    errors = []
    vi.spyOn(console, 'log').mockImplementation((line) => out.push(String(line)))
    vi.spyOn(console, 'error').mockImplementation((line) => errors.push(String(line)))
    // The ranges are resolved against the clock, and the header prints them.
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respondWith(FLAMEGRAPH)))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('prints the usage and exits 0 for --help, so a script can ask for it', async () => {
    await expect(main(['--help'], {})).resolves.toBe(0)

    expect(out.join('\n')).toContain('pyroscope-analyze: print a profile')
  })

  it('exits 1 without a service, which is the one option it cannot default', async () => {
    await expect(main([], {})).resolves.toBe(1)

    expect(out.join('\n')).toContain('--service <name>')
  })

  it('prints the flat self-time table', async () => {
    await expect(main(['--service', 'my-service'], {})).resolves.toBe(0)

    const printed = out.join('\n')
    expect(printed).toContain('{service_name="my-service"}  wall:wall:nanoseconds:wall:nanoseconds')
    expect(printed).toContain('1.00 s total')
    expect(printed).toContain('inner')
    expect(printed).toContain('500.0 ms')
    expect(printed).toContain('50.0%')
  })

  it('asks Pyroscope for the range and the credentials it was given', async () => {
    await main(['--service', 'my-service', '--from', 'now-1h', '--until', 'now'], {
      PYROSCOPE_SERVER_ADDRESS: 'https://profiles.example/',
      PYROSCOPE_AUTH_TOKEN: 'token',
    })

    expect(fetch).toHaveBeenCalledOnce()
    const [endpoint, request] = fetch.mock.calls[0]
    expect(endpoint).toBe(
      'https://profiles.example/querier.v1.QuerierService/SelectMergeStacktraces',
    )
    expect(request.headers.authorization).toBe('Bearer token')
    const body = JSON.parse(request.body)
    expect(body).toMatchObject({
      profileTypeID: 'wall:wall:nanoseconds:wall:nanoseconds',
      labelSelector: '{service_name="my-service"}',
    })
    expect(body.end - body.start).toBe(3_600_000)
  })

  it('reports what Pyroscope refused rather than an empty profile', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('not authorized'),
      json: () => Promise.resolve({}),
    })

    await expect(main(['--service', 'my-service'], {})).rejects.toThrow(
      'Pyroscope answered 401: not authorized',
    )
  })

  // A Pyroscope that takes the connection and then goes quiet would otherwise
  // hold the command open until the transport gives up.
  it('gives up on a Pyroscope that stops answering', async () => {
    fetch.mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    )

    await expect(main(['--service', 'my-service', '--timeout', '5'], {})).rejects.toThrow(
      'Pyroscope did not answer within 5s',
    )
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('passes a connection failure on as it came', async () => {
    fetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(main(['--service', 'my-service'], {})).rejects.toThrow('fetch failed')
  })

  it('reports an answer that carries no flamegraph at all', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ error: 'x' }) })

    await expect(main(['--service', 'my-service'], {})).rejects.toThrow(
      'Unexpected answer from Pyroscope',
    )
  })

  it('exits 2 and says where to look when the range holds no samples', async () => {
    fetch.mockResolvedValue(respondWith({ names: [], levels: [], total: 0 }))

    await expect(main(['--service', 'my-service'], {})).resolves.toBe(2)

    expect(errors.join('\n')).toContain('No samples for {service_name="my-service"}')
  })

  // A total with no readable node means the encoding changed under the tool.
  // Printing an empty table over it reads as "the service did nothing".
  it('exits 2 when a profile arrives that it cannot read', async () => {
    fetch.mockResolvedValue(respondWith({ names: ['total'], levels: [[]], total: 1e9 }))

    await expect(main(['--service', 'my-service'], {})).resolves.toBe(2)

    expect(errors.join('\n')).toContain('no frames could be read')
  })

  it('prints the call tree under the table', async () => {
    await expect(main(['--service', 'my-service', '--tree'], {})).resolves.toBe(0)

    const printed = out.join('\n')
    expect(printed).toContain('call tree, frames under 1.0% of the total omitted')
    expect(printed).toContain('  run')
    expect(printed).toContain('    inner')
  })

  it('leaves the small frames out of the tree at the share it was given', async () => {
    await main(['--service', 'my-service', '--tree', '--min-share', '20'], {})

    const tree = out.join('\n').split('call tree')[1]
    expect(tree).toContain('run')
    expect(tree).not.toContain('gc')
  })

  it('prints exact numbers for a script, and the tree with them', async () => {
    await expect(main(['--service', 'my-service', '--json', '--tree'], {})).resolves.toBe(0)

    const report = JSON.parse(out.join('\n'))
    expect(report).toMatchObject({
      selector: '{service_name="my-service"}',
      unit: 'time',
      total: 1e9,
      frames: [
        { name: 'inner', self: 5e8, share: 0.5 },
        { name: 'run', self: 4e8, share: 0.4 },
        { name: 'gc', self: 1e8, share: 0.1 },
      ],
    })
    expect(report.tree).toMatchObject({ name: 'total', total: 1e9, share: 1 })
    expect(report.tree.children.map((child) => child.name)).toEqual(['run', 'gc'])
  })

  it('cuts --json to --top as well, and says how many there were', async () => {
    await expect(main(['--service', 'my-service', '--json', '--top', '1'], {})).resolves.toBe(0)

    const report = JSON.parse(out.join('\n'))
    expect(report.frames).toEqual([{ name: 'inner', self: 5e8, share: 0.5 }])
    expect(report.frameCount).toBe(3)
  })

  // A gate reads standard output. Prose on standard error and an empty stdout
  // is a parse error rather than an answer it can act on.
  it('still prints a report under --json when there is nothing to show', async () => {
    fetch.mockResolvedValue(respondWith({ names: [], levels: [], total: 0 }))

    await expect(main(['--service', 'my-service', '--json'], {})).resolves.toBe(2)

    expect(JSON.parse(out.join('\n'))).toMatchObject({ total: 0, frameCount: 0, frames: [] })
    expect(errors.join('\n')).toContain('No samples for')
  })

  it('prints one under --json for an answer it cannot read, too', async () => {
    fetch.mockResolvedValue(respondWith({ names: ['total'], levels: [[]], total: 1e9 }))

    await expect(main(['--service', 'my-service', '--json'], {})).resolves.toBe(2)

    expect(JSON.parse(out.join('\n'))).toMatchObject({ total: 1e9, frames: [] })
    expect(errors.join('\n')).toContain('no frames could be read')
  })

  // Column widths used to be a spread into `Math.max`, one argument per row,
  // which a real profile with no share filter is well past.
  it('prints a tree too large to spread into a call', async () => {
    const nodes = 150_000
    const level = Array.from({ length: nodes * 4 }, (_, index) => (index % 4 === 0 ? 0 : 1))
    fetch.mockResolvedValue(
      respondWith({ names: ['total', 'leaf'], levels: [[0, nodes, 0, 0], level], total: nodes }),
    )

    await expect(main(['--service', 'my-service', '--tree', '--min-share', '0'], {})).resolves.toBe(
      0,
    )

    expect(out.length).toBeGreaterThan(nodes)
  })

  it('names only the frames the table left out', async () => {
    await main(['--service', 'my-service', '--top', '1'], {})

    expect(out.join('\n')).toContain('2 more frames. Raise --top to see them.')
  })

  it('diffs a second range per frame when one is asked for', async () => {
    fetch.mockResolvedValueOnce(respondWith(FLAMEGRAPH)).mockResolvedValueOnce(
      respondWith({
        ...FLAMEGRAPH,
        levels: [
          [0, 1e9, 0, 0],
          [0, 9e8, 9e8, 1],
        ],
        total: 1e9,
      }),
    )

    await expect(
      main(
        ['--service', 'my-service', '--against-from', 'now-30m', '--against-until', 'now-15m'],
        {},
      ),
    ).resolves.toBe(0)

    expect(fetch).toHaveBeenCalledTimes(2)
    const printed = out.join('\n')
    expect(printed).toContain('against 2026-09-16T11:30:00.000Z to 2026-09-16T11:45:00.000Z')
    expect(printed).toContain('delta')
    expect(printed).toContain('-500.0 ms')
  })

  it('defaults the second range to a window of the same length before the first', async () => {
    await main(['--service', 'my-service', '--from', 'now-10m', '--against-from', 'now-30m'], {})

    const [, second] = fetch.mock.calls
    const body = JSON.parse(second[1].body)
    expect(body.end - body.start).toBe(1_200_000)
  })

  it('refuses a second range that runs backwards as well', async () => {
    await expect(
      main(['--service', 'my-service', '--against-from', 'now', '--against-until', 'now-30m'], {}),
    ).rejects.toThrow('--against-from has to come before --against-until')
  })

  // A baseline that held samples against a current range that held none is the
  // strongest regression signal a gate can read, and a missing `against` field
  // is indistinguishable from no comparison having been asked for.
  it('reports the baseline under --json when the current range holds nothing', async () => {
    fetch
      .mockResolvedValueOnce(respondWith({ names: [], levels: [], total: 0 }))
      .mockResolvedValueOnce(respondWith(FLAMEGRAPH))

    await expect(
      main(['--service', 'my-service', '--json', '--against-from', 'now-30m'], {}),
    ).resolves.toBe(2)

    expect(JSON.parse(out.join('\n'))).toMatchObject({ total: 0, against: 1e9, frames: [] })
    expect(errors.join('\n')).toContain('The range compared against held 1.00 s')
  })

  it('writes collapsed stacks for flamegraph.pl when asked', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pyroscope-analyze-'))
    const file = join(directory, 'out.folded')

    try {
      await expect(main(['--service', 'my-service', '--folded', file], {})).resolves.toBe(0)

      expect(readFileSync(file, 'utf8')).toBe(
        'total;run 400000000\ntotal;run;inner 500000000\ntotal;gc 100000000\n',
      )
      expect(out.join('\n')).toContain(`Collapsed stacks written to ${file}.`)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

/**
 * The exit codes are what a `set -e` script, a Makefile target and a CI gate
 * read, and only the executable itself can be asked for them.
 */
describe('the pyroscope-analyze executable', () => {
  const executable = fileURLToPath(new URL('./analyze.mjs', import.meta.url))
  const run = (args) => promisify(execFile)(process.execPath, [executable, ...args])

  it('exits 0 after printing the usage for --help', async () => {
    const { stdout } = await run(['--help'])

    expect(stdout).toContain('pyroscope-analyze: print a profile')
  })

  it('exits 1 with the reason on standard error when it cannot reach Pyroscope', async () => {
    // Port 1: nothing listens there, so the connection is refused at once.
    const failure = await run(['--service', 'my-service', '--url', 'http://127.0.0.1:1']).catch(
      (error) => error,
    )

    expect(failure.code).toBe(1)
    expect(failure.stderr).toContain('fetch failed')
  })
})
