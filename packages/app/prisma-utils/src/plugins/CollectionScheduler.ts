import { setTimeout } from 'node:timers/promises'

export type CollectionScheduler = {
  start: () => void
  stop: () => void
}

export class PromiseBasedCollectionScheduler implements CollectionScheduler {
  private active = true
  private readonly collectionIntervalInMs: number
  private readonly collect: () => Promise<void>

  constructor(collectionIntervalInMs: number, collect: () => Promise<void>) {
    this.collectionIntervalInMs = collectionIntervalInMs
    this.collect = collect
  }

  async start(): Promise<void> {
    while (this.active) {
      await this.collect()
      await setTimeout(this.collectionIntervalInMs)
    }
  }

  stop(): void {
    this.active = false
  }
}
