import type { BaseLogger, Bindings, ChildLoggerOptions, Logger } from 'pino'
import type pino from 'pino'

import type { SafeJob } from './types'

const hasMsgProperty = (obj: unknown): obj is { msg: string } => {
	return typeof obj === 'object' && obj !== null && 'msg' in obj && typeof obj.msg === 'string'
}

const hasMessageProperty = (obj: unknown): obj is { message: string } => {
	return (
		typeof obj === 'object' && obj !== null && 'message' in obj && typeof obj.message === 'string'
	)
}

export class BackgroundJobProcessorLogger implements BaseLogger {
	private readonly logger: Logger
	private readonly job: SafeJob<unknown>

	constructor(logger: Logger, job: SafeJob<unknown>) {
		this.logger = logger
		this.job = job
	}

	get level(): pino.LevelWithSilentOrString {
		return this.logger.level
	}

	set level(level: pino.LevelWithSilentOrString) {
		this.logger.level = level
	}

	silent: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.silent(obj, msg, args)
		// silent should not log on job
	}

	trace: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.trace(obj, msg, args)
		this.jobLog('trace', obj, msg)
	}

	debug: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.debug(obj, msg, args)
		this.jobLog('debug', obj, msg)
	}

	info: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.info(obj, msg, args)
		this.jobLog('info', obj, msg)
	}

	warn: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.warn(obj, msg, args)
		this.jobLog('warn', obj, msg)
	}

	error: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.error(obj, msg, args)
		this.jobLog('error', obj, msg)
	}

	fatal: pino.LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => {
		this.logger.fatal(obj, msg, args)
		this.jobLog('fatal', obj, msg)
	}

	child(bindings: Bindings, options?: ChildLoggerOptions): BaseLogger {
		return new BackgroundJobProcessorLogger(this.logger.child(bindings, options), this.job)
	}

	private jobLog(level: pino.Level, obj: unknown, msg?: string) {
		const levelValue = this.logger.levels.values[level]
		if (levelValue < this.logger.levelVal) return

		let message: string | undefined

		if (typeof obj === 'string') message = obj
		else if (hasMsgProperty(obj)) message = obj.msg
		else if (hasMessageProperty(obj)) message = obj.message
		else message = msg

		if (!message) return

		void this.job.log(`[${level}] ${message}`).catch(() => undefined) // in case of error just ignore
	}
}
