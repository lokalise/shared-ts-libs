import { afterEach, describe, expect, it } from 'vitest'
import { updateEnvFile } from './syncEnvWithVault'
import { unlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const DOT_ENV_PATH = __dirname + '/test_env'

function readDotEnvFile() {
	let rawcontent = readFileSync(DOT_ENV_PATH, { encoding: 'utf8' })

	console.log(rawcontent)
	return rawcontent.trim().split('\n')
}

function putToDotEnvFile(lines: string[]) {
	writeFileSync(DOT_ENV_PATH, lines.join('\n'))
}

describe('sync env with vault', () => {
	afterEach(() => {
		if (existsSync(DOT_ENV_PATH)) {
			unlinkSync(DOT_ENV_PATH)
		}
	})

	it('should add env vars to file', () => {
		updateEnvFile(
			{
				var1: 'value1',
				var2: 'value2',
			},
			DOT_ENV_PATH,
		)

		const content = readDotEnvFile()

		expect(content).toEqual(['var1=value1', 'var2=value2'])
	})

	it('should merge existing data in file with the one from input', () => {
		putToDotEnvFile(['var0=value0', 'var3=value3'])

		updateEnvFile(
			{
				var1: 'value1',
				var2: 'value2',
			},
			DOT_ENV_PATH,
		)

		const content = readDotEnvFile()

		expect(content).toEqual(['var0=value0', 'var3=value3', 'var1=value1', 'var2=value2'])
	})

	it('should update value if exists in file', () => {
		putToDotEnvFile(['var0=value0', 'var3=value3'])

		updateEnvFile(
			{
				var0: 'value1',
			},
			DOT_ENV_PATH,
		)

		const content = readDotEnvFile()

		expect(content).toEqual(['var0=value1', 'var3=value3'])
	})

	it('should do nothing if provided env vars are empty', () => {
		updateEnvFile({}, DOT_ENV_PATH)

		expect(existsSync(DOT_ENV_PATH)).toEqual(false)
	})

	it('should replace value of key if in file it is empty', () => {
		putToDotEnvFile(['var0=', 'var3=value3'])

		updateEnvFile(
			{
				var0: 'value0',
			},
			DOT_ENV_PATH,
		)

		const content = readDotEnvFile()

		expect(content).toEqual(['var0=value0', 'var3=value3'])
	})

	it('should wrap value in quotes if vault value has new line', () => {
		updateEnvFile(
			{
				var0: 'value\nwith new line',
			},
			DOT_ENV_PATH,
		)

		const content = readDotEnvFile()
		console.log(content)
		expect(content).toEqual(['var0=value0', 'var3=value3'])
	})
})