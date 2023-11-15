import { describe, expect, it } from 'vitest'

import { languages } from './languages'
import { regions } from './regions'
import { scripts } from './scripts'
import { standardLocales } from './standard-locales'

describe('standard-locales', () => {
	it('all languages are part of our central list', () => {
		expect.assertions(219)

		for (const tag of standardLocales) {
			const locale = new Intl.Locale(tag)

			expect(languages).toContain(locale.language)
		}
	})

	it('all scripts are part of our central list', () => {
		expect.assertions(15)

		for (const tag of standardLocales) {
			const locale = new Intl.Locale(tag)

			if (locale.script) {
				expect(scripts).toContain(locale.script)
			}
		}
	})

	it('all regions are part of our central list', () => {
		expect.assertions(216)

		for (const tag of standardLocales) {
			const locale = new Intl.Locale(tag)

			if (locale.region) {
				expect(regions).toContain(locale.region)
			}
		}
	})
})
