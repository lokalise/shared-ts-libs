import { describe, expect, it } from 'vitest'
import { waitAndRetry } from './waitAndRetry.ts'

class Counter {
  private readonly timeOfSucces: number
  public executionCounter: number
  constructor(msecsTillSuccess: number) {
    this.timeOfSucces = Date.now() + msecsTillSuccess
    this.executionCounter = 0
  }

  process() {
    this.executionCounter++
    return Date.now() >= this.timeOfSucces
  }
}

describe('waitUtils', () => {
  describe('waitAndRetry', () => {
    it('executes once if there is an instant condition match', async () => {
      const counter = new Counter(0)

      const result = await waitAndRetry(() => {
        return counter.process()
      })

      expect(result).toBe(true)
      expect(counter.executionCounter).toBe(1)
    })

    it('executes until there is a condition match', async () => {
      const counter = new Counter(1000)

      const result = await waitAndRetry(
        () => {
          return counter.process()
        },
        50,
        30,
      )

      expect(result).toBe(true)
      expect(counter.executionCounter > 0).toBe(true)
    })

    it('times out of there is never a condition match', async () => {
      const counter = new Counter(1000)

      const result = await waitAndRetry(
        () => {
          return counter.process()
        },
        20,
        30,
      )

      expect(result).toBe(false)
      expect(counter.executionCounter > 0).toBe(true)
    })

    it('handles an error', async () => {
      await expect(
        waitAndRetry(() => {
          throw new Error('it broke')
        }),
      ).rejects.toThrowError('it broke')
    })
  })
})
