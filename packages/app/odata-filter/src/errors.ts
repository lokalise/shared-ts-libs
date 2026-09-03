export class ODataFilterError extends Error {
  public readonly filter: string

  constructor(message: string, filter: string) {
    super(message)
    this.name = 'ODataFilterError'
    this.filter = filter
  }
}

export class ODataParseError extends ODataFilterError {
  public override readonly cause?: Error

  constructor(message: string, filter: string, cause?: Error) {
    super(message, filter)
    this.name = 'ODataParseError'
    this.cause = cause
  }
}

export class UnsupportedConstructError extends ODataFilterError {
  constructor(message: string, filter: string) {
    super(message, filter)
    this.name = 'UnsupportedConstructError'
  }
}

export class ODataEvaluationError extends ODataFilterError {
  constructor(message: string, filter: string) {
    super(message, filter)
    this.name = 'ODataEvaluationError'
  }
}
