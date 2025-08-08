import type { CommonLogger } from '@lokalise/node-core'

export class FakeLogger implements CommonLogger {
  public readonly loggedMessages: unknown[] = []
  public readonly loggedWarnings: unknown[] = []
  public readonly loggedErrors: unknown[] = []

  public level = 'debug'

  get msgPrefix(): string | undefined {
    return undefined
  }

  debug(obj: unknown) {
    this.loggedMessages.push(obj)
  }
  error(obj: unknown) {
    this.loggedErrors.push(obj)
  }
  fatal(obj: unknown) {
    this.loggedErrors.push(obj)
  }
  info(obj: unknown) {
    this.loggedMessages.push(obj)
  }
  trace(obj: unknown) {
    this.loggedMessages.push(obj)
  }
  warn(obj: unknown) {
    this.loggedWarnings.push(obj)
  }

  silent(_obj: unknown) {
    return
  }

  child(): CommonLogger {
    return this
  }

  isLevelEnabled(): boolean {
    return true
  }
}
