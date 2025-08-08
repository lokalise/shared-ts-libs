import type { CommonLogger } from '@lokalise/node-core'
import type pino from 'pino'
import type { Bindings, ChildLoggerOptions } from 'pino'
import type { SafeJob } from '../types.ts'

const hasMsgProperty = (obj: unknown): obj is { msg: string } => {
  return typeof obj === 'object' && obj !== null && 'msg' in obj && typeof obj.msg === 'string'
}

const hasMessageProperty = (obj: unknown): obj is { message: string } => {
  return (
    typeof obj === 'object' && obj !== null && 'message' in obj && typeof obj.message === 'string'
  )
}

export class BackgroundJobProcessorLogger implements CommonLogger {
  private readonly logger: CommonLogger
  private readonly job: SafeJob<unknown>

  constructor(logger: CommonLogger, job: SafeJob<unknown>) {
    this.logger = logger
    this.job = job
  }

  get msgPrefix(): string | undefined {
    return this.logger.msgPrefix
  }

  get level(): pino.LevelWithSilentOrString {
    return this.logger.level
  }

  set level(level: pino.LevelWithSilentOrString) {
    this.logger.level = level
  }

  silent: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.silent(obj, msg)
  }

  trace: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.trace(obj, msg)
    this.jobLog('trace', obj, msg)
  }

  debug: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.debug(obj, msg)
    this.logger.debug(obj, 'msg')
    this.jobLog('debug', obj, msg)
  }

  info: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.info(obj, msg)
    this.jobLog('info', obj, msg)
  }

  warn: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.warn(obj, msg)
    this.jobLog('warn', obj, msg)
  }

  error: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.error(obj, msg)
    this.jobLog('error', obj, msg)
  }

  fatal: pino.LogFn = (obj: unknown, msg?: string) => {
    this.logger.fatal(obj, msg)
    this.jobLog('fatal', obj, msg)
  }

  child(bindings: Bindings, options?: ChildLoggerOptions): CommonLogger {
    return new BackgroundJobProcessorLogger(this.logger.child(bindings, options), this.job)
  }

  private jobLog(level: pino.Level, obj: unknown, msg?: string) {
    if (!this.isLevelEnabled(level)) {
      return
    }

    let message: string | undefined

    if (typeof obj === 'string') message = obj
    else if (hasMsgProperty(obj)) message = obj.msg
    else if (hasMessageProperty(obj)) message = obj.message
    else message = msg

    if (!message) return

    void this.job.log(`[${level}] ${message}`).catch(() => undefined) // in case of error just ignore
  }

  isLevelEnabled(level: string): boolean {
    return this.logger.isLevelEnabled(level)
  }
}
