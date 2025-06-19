import type { ErrorReport } from '@lokalise/fastify-extras'
import type { ErrorReporter } from '@lokalise/node-core'

export class FakeErrorReporter implements ErrorReporter {
  private _calls: ErrorReport[] = []

  report(errorReport: ErrorReport): void {
    this._calls.push(errorReport)
  }

  clean(): void {
    this._calls = []
  }

  get calls(): ErrorReport[] {
    return this._calls
  }
}
