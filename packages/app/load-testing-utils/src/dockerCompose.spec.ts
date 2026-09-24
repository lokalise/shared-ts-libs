import { describe, expect, it, vi } from 'vitest'
import {
  composeArgs,
  composeDown,
  composeDownArgs,
  composeUp,
  composeUpArgs,
} from './dockerCompose.ts'
import type { ProcessSupervisor } from './processes.ts'

const project = { file: 'compose.yml', project: 'svc-perf', cwd: '/stack' }

describe('compose args', () => {
  it('names the file and project, then the profiles', () => {
    expect(composeArgs(project, ['a', 'b'], 'ps')).toEqual([
      'compose',
      '-f',
      'compose.yml',
      '-p',
      'svc-perf',
      '--profile',
      'a',
      '--profile',
      'b',
      'ps',
    ])
  })

  it('waits for health on up', () => {
    expect(composeUpArgs(project)).toEqual([
      'compose',
      '-f',
      'compose.yml',
      '-p',
      'svc-perf',
      'up',
      '-d',
      '--wait',
    ])
  })

  it('removes volumes on down only when asked', () => {
    expect(composeDownArgs(project).at(-1)).toBe('down')
    expect(composeDownArgs(project, { profiles: ['profiling'], removeVolumes: true })).toEqual([
      'compose',
      '-f',
      'compose.yml',
      '-p',
      'svc-perf',
      '--profile',
      'profiling',
      'down',
      '-v',
    ])
  })
})

describe('composeUp and composeDown', () => {
  it('run docker through the supervisor in the project directory', () => {
    const run = vi.fn()
    const supervisor = { run } as unknown as ProcessSupervisor

    composeUp(supervisor, project, { profiles: ['profiling'] })
    composeDown(supervisor, project)

    expect(run).toHaveBeenNthCalledWith(
      1,
      'docker',
      'docker',
      composeUpArgs(project, { profiles: ['profiling'] }),
      { cwd: '/stack' },
    )
    expect(run).toHaveBeenNthCalledWith(2, 'docker', 'docker', composeDownArgs(project), {
      cwd: '/stack',
    })
  })
})
