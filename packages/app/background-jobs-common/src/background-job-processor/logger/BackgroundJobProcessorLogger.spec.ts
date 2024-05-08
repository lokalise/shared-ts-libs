import { CommonLogger, globalLogger } from '@lokalise/node-core'
import { beforeEach, describe, expect, it, MockInstance, vitest } from 'vitest'

import { BackgroundJobProcessorLogger } from './BackgroundJobProcessorLogger'

const logger = globalLogger

describe('BackgroundJobProcessorLogger', () => {
	let testLogger: CommonLogger
	let backgroundJobProcessorLogger: BackgroundJobProcessorLogger
	let jobLogSpy: MockInstance

	beforeEach(() => {
		testLogger = logger.child({ test: true })
		const fakeJob = { log: async () => Promise.resolve() }
		jobLogSpy = vitest.spyOn(fakeJob, 'log')
		backgroundJobProcessorLogger = new BackgroundJobProcessorLogger(testLogger, fakeJob as any)
	})

	describe('level', () => {
		it('changes the level of the logger', () => {
			backgroundJobProcessorLogger.level = 'debug'
			expect(backgroundJobProcessorLogger.level).toBe('debug')

			backgroundJobProcessorLogger.level = 'silent'
			expect(backgroundJobProcessorLogger.level).toBe('silent')

			backgroundJobProcessorLogger.level = 'fatal'
			expect(backgroundJobProcessorLogger.level).toBe('fatal')
		})
	})

	describe('silent', () => {
		let silentSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'silent'
			silentSpy = vitest.spyOn(testLogger, 'silent')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }])('log', (testCase) => {
			backgroundJobProcessorLogger.silent(testCase)
			expect(silentSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).not.toHaveBeenCalled()
		})
	})

	describe('trace', () => {
		let traceSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'trace'
			traceSpy = vitest.spyOn(testLogger, 'trace')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }, { message: 'test' }])('log', (testCase) => {
			backgroundJobProcessorLogger.trace(testCase)
			expect(traceSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).toHaveBeenCalledWith('[trace] test')
		})

		it('does not log with upper log level', () => {
			testLogger.level = 'debug'

			backgroundJobProcessorLogger.trace({ msg: 'test' })
			expect(jobLogSpy).not.toHaveBeenCalled()
		})
	})

	describe('debug', () => {
		let debugSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'debug'
			debugSpy = vitest.spyOn(testLogger, 'debug')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }, { message: 'test' }])('log', (testCase) => {
			backgroundJobProcessorLogger.debug(testCase)
			expect(debugSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).toHaveBeenCalledWith('[debug] test')
		})

		it('does not log with upper log level', () => {
			testLogger.level = 'info'

			backgroundJobProcessorLogger.debug({ msg: 'test' })
			expect(jobLogSpy).not.toHaveBeenCalled()
		})
	})

	describe('info', () => {
		let infoSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'info'
			infoSpy = vitest.spyOn(testLogger, 'info')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }, { message: 'test' }])('log', (testCase) => {
			backgroundJobProcessorLogger.info(testCase)
			expect(infoSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).toHaveBeenCalledWith('[info] test')
		})

		it('does not log with upper log level', () => {
			testLogger.level = 'warn'

			backgroundJobProcessorLogger.info({ msg: 'test' })
			expect(jobLogSpy).not.toHaveBeenCalled()
		})

		it('does not log empty messages', () => {
			testLogger.level = 'info'

			// @ts-expect-error We are simulating wrong input
			backgroundJobProcessorLogger.info()
			expect(jobLogSpy).not.toHaveBeenCalled()
		})
	})

	describe('warn', () => {
		let warnSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'warn'
			warnSpy = vitest.spyOn(testLogger, 'warn')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }, { message: 'test' }])('log', (testCase) => {
			backgroundJobProcessorLogger.warn(testCase)
			expect(warnSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).toHaveBeenCalledWith('[warn] test')
		})

		it('does not log with upper log level', () => {
			backgroundJobProcessorLogger.level = 'error'

			backgroundJobProcessorLogger.warn({ msg: 'test' })
			expect(jobLogSpy).not.toHaveBeenCalled()
		})
	})

	describe('error', () => {
		let errorSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'error'
			errorSpy = vitest.spyOn(testLogger, 'error')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }, { message: 'test' }])('log', (testCase) => {
			backgroundJobProcessorLogger.error(testCase)
			expect(errorSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).toHaveBeenCalledWith('[error] test')
		})

		it('does not log with upper log level', () => {
			backgroundJobProcessorLogger.level = 'fatal'

			backgroundJobProcessorLogger.error({ msg: 'test' })
			expect(jobLogSpy).not.toHaveBeenCalled()
		})
	})

	describe('fatal', () => {
		let fatalSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'fatal'
			fatalSpy = vitest.spyOn(testLogger, 'fatal')
		})

		it.each(['test', { msg: 'test', prop: 'prop' }, { message: 'test' }])('log', (testCase) => {
			backgroundJobProcessorLogger.fatal(testCase)
			expect(fatalSpy).toHaveBeenCalledWith(testCase, undefined, [])
			expect(jobLogSpy).toHaveBeenCalledWith('[fatal] test')
		})
	})

	describe('child', () => {
		let childSpy: MockInstance

		beforeEach(() => {
			testLogger.level = 'fatal'
			childSpy = vitest.spyOn(testLogger, 'child')
		})

		it('creates a child logger', () => {
			const result = backgroundJobProcessorLogger.child({ child: true })
			expect(result).toBeInstanceOf(BackgroundJobProcessorLogger)
			expect(childSpy).toHaveBeenCalledOnce()
			expect(childSpy).toHaveBeenCalledWith({ child: true }, undefined)
		})
	})
})
