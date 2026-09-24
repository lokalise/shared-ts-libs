import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refuseIfPortTaken, waitForHealth } from './health.ts'

const servers: Server[] = []

async function listen(status: () => number): Promise<number> {
  const server = createServer((_request, response) => {
    response.writeHead(status())
    response.end()
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return (server.address() as AddressInfo).port
}

async function freePort(): Promise<number> {
  const port = await listen(() => 200)
  const server = servers.pop() as Server
  await new Promise((done) => server.close(done))
  return port
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
})

describe('waitForHealth', () => {
  it('returns once the endpoint answers 2xx, after retrying the failures', async () => {
    let calls = 0
    const port = await listen(() => (++calls < 3 ? 503 : 200))
    const write = vi.fn()

    await waitForHealth('svc', `http://127.0.0.1:${port}/health`, { intervalMs: 10, write })

    expect(calls).toBe(3)
    expect(write.mock.calls.map(([text]) => text).join('')).toBe(
      `[runner] waiting for svc at http://127.0.0.1:${port}/health ..ok\n`,
    )
  })

  it('throws after the timeout, with the hint', async () => {
    const port = await freePort()
    await expect(
      waitForHealth('svc', `http://127.0.0.1:${port}/health`, {
        timeoutMs: 50,
        intervalMs: 10,
        hint: 'see .logs',
        write: () => {},
      }),
    ).rejects.toThrow('svc did not become healthy within 0.05s; see .logs')
  })

  it('writes progress to stdout by default', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const port = await listen(() => 200)
    await waitForHealth('svc', `http://127.0.0.1:${port}/`)
    expect(write).toHaveBeenCalledWith('ok\n')
    write.mockRestore()
  })
})

describe('refuseIfPortTaken', () => {
  it('passes when nothing listens', async () => {
    await expect(refuseIfPortTaken('fakes', await freePort())).resolves.toBeUndefined()
  })

  it('throws when anything answers, whatever the status', async () => {
    const port = await listen(() => 404)
    await expect(refuseIfPortTaken('fakes', port)).rejects.toThrow(
      `something already answers on :${port}, which is fakes's port. Stop it first.`,
    )
    await expect(
      refuseIfPortTaken('fakes', port, { path: '/', hint: 'pass --no-fakes' }),
    ).rejects.toThrow('Stop it first, or pass --no-fakes.')
  })
})
