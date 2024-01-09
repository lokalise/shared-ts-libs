import { describe, expect, it } from 'vitest'

import {
	isStandardLocale,
	getStandardLocales,
	isSupportedLocale,
	getCommonRegionsForLanguage,
	getCommonLanguagesForRegion,
	normalizeLocale,
	parseLocale,
	stringifyLocale,
	getLanguageNameInEnglish,
	getLocalisedLanguageName,
} from './index'

describe('supported-languages package', () => {
	describe('getStandardLocales', () => {
		it('returns a list of languages', () => {
			const languages = getStandardLocales()
			expect(languages).toHaveLength(219)

			expect(languages).toContain('da-DK')
			expect(languages).toContain('en-US')
			expect(languages).toContain('bs-Latn-BA')
		})
	})

	describe('isStandardLocale', () => {
		it('returns true for matching locales', () => {
			expect(isStandardLocale('en-US')).toBe(true)
			expect(isStandardLocale('fr-CA')).toBe(true)
			expect(isStandardLocale('bs-Latn-BA')).toBe(true)
		})

		it('returns false for non-matching locales', () => {
			expect(isStandardLocale('en')).toBe(false)
			expect(isStandardLocale('en-DA')).toBe(false)
			expect(isStandardLocale('foo')).toBe(false)
		})
	})

	describe('isSupportedLocale', () => {
		it('returns true for valid values', () => {
			expect(isSupportedLocale('en')).toBe(true)
			expect(isSupportedLocale('en-US')).toBe(true)
			expect(isSupportedLocale('en-Latn-US')).toBe(true)
			expect(isSupportedLocale('sr-Cyrl-CS')).toBe(true)

			expect(isSupportedLocale('en-us')).toBe(true)
			expect(isSupportedLocale('my')).toBe(true) // Burmese

			expect(isSupportedLocale('en-RU')).toBe(true) // Valid Language and Region
			expect(isSupportedLocale('en-001')).toBe(true) // 001 is a valid Region

			expect(isSupportedLocale('en-1234')).toBe(true)
			expect(isSupportedLocale('en-9999')).toBe(true)
			expect(isSupportedLocale('en-00001')).toBe(true)

			expect(isSupportedLocale('zh-CN-script')).toBe(true)
			expect(isSupportedLocale('in-FRENCH')).toBe(true) // 'in' is identified as 'id' which is Indonesian
			expect(isSupportedLocale('in-FILES')).toBe(true)
			expect(isSupportedLocale('in-FILES-lalaland')).toBe(true)
		})

		it('returns false for invalid values', () => {
			expect(isSupportedLocale('abc')).toBe(false) // invalid language
			expect(isSupportedLocale('abc-US')).toBe(false) // invalid language
			expect(isSupportedLocale('en-AB')).toBe(false) // invalid region
			expect(isSupportedLocale('en-Abcd-US')).toBe(false) // invalid script
		})
	})

	describe('getCommonRegionsForLanguage', () => {
		it('returns list of regions for known languages', () => {
			expect(getCommonRegionsForLanguage('zh')).toMatchObject(['CN', 'HK', 'MO', 'SG', 'TW'])
		})

		it('returns empty list for languages not in standard locales', () => {
			expect(getCommonRegionsForLanguage('ace')).toMatchObject([])
		})

		it('returns empty list for unknown languages', () => {
			expect(getCommonRegionsForLanguage('abc')).toMatchObject([])
		})
	})

	describe('getCommonLanguagesForRegion', () => {
		it('returns list of languages for known regions', () => {
			expect(getCommonLanguagesForRegion('CA')).toMatchObject(['en', 'fr', 'iu'])
		})

		it('returns empty list for regions not in standard locales', () => {
			expect(getCommonLanguagesForRegion('AC')).toMatchObject([])
		})

		it('returns empty list for unknown regions', () => {
			expect(getCommonLanguagesForRegion('AB')).toMatchObject([])
		})
	})

	describe('parseLocale', () => {
		describe('with valid locale tags', () => {
			it('parses language only', () => {
				const { language, script, region } = parseLocale('en').result
				expect(language).toBe('en')
				expect(script).toBeUndefined()
				expect(region).toBeUndefined()
			})

			it('parses language and script', () => {
				const { language, script, region } = parseLocale('en-Latn').result
				expect(language).toBe('en')
				expect(script).toBe('Latn')
				expect(region).toBeUndefined()
			})

			it('parses language and region', () => {
				const { language, script, region } = parseLocale('en-US').result
				expect(language).toBe('en')
				expect(script).toBeUndefined()
				expect(region).toBe('US')
			})

			it('parses language, script and region', () => {
				const { language, script, region } = parseLocale('en-Latn-US').result
				expect(language).toBe('en')
				expect(script).toBe('Latn')
				expect(region).toBe('US')
			})

			it('ignores additional subtags', () => {
				const { language, script, region } = parseLocale('en-US-u-ca-gregory').result
				expect(language).toBe('en')
				expect(script).toBeUndefined()
				expect(region).toBe('US')
			})
		})

		it('throws on unsupported value', () => {
			expect(parseLocale('abc-AB').error).toBe('Locale tag abc-AB is not supported')
		})
	})

	describe('stringifyLocale', () => {
		it('stringifies language only', () => {
			expect(stringifyLocale({ language: 'en' })).toBe('en')
		})

		it('stringifies language and script', () => {
			expect(stringifyLocale({ language: 'en', script: 'Latn' })).toBe('en-Latn')
		})

		it('stringifies language and region', () => {
			expect(stringifyLocale({ language: 'en', region: 'US' })).toBe('en-US')
		})

		it('stringifies language, script and region', () => {
			expect(stringifyLocale({ language: 'en', script: 'Latn', region: 'US' })).toBe('en-Latn-US')
		})
	})

	describe('normalizeLocale', () => {
		it('normalizeLocale language', () => {
			expect(normalizeLocale('en')).toBe('en')
			expect(normalizeLocale('hello')).toBe('hello')
		})

		it('normalizeLocale language and script', () => {
			expect(normalizeLocale('en-Latn')).toBe('en-Latn')
		})

		it('normalizeLocale language and region', () => {
			expect(normalizeLocale('en-US')).toBe('en-US')
			expect(normalizeLocale('en-RU')).toBe('en-RU')

			expect(normalizeLocale('en-001')).toBe('en-001') // 001 is a valid Region

			expect(normalizeLocale('en-1234')).toBe('en')
			expect(normalizeLocale('en-9999')).toBe('en')
			expect(normalizeLocale('en-00001')).toBe('en')
			expect(normalizeLocale('en-hello')).toBe('en')

			expect(normalizeLocale('in-FRENCH')).toBe('id') // 'in' is identified as 'id' which is Indonesian
			expect(normalizeLocale('in-FILES')).toBe('id')
		})

		it('normalizeLocale language, script and region', () => {
			expect(normalizeLocale('en-Latn-US')).toBe('en-Latn-US')
			expect(normalizeLocale('zh-CN-script')).toBe('zh-CN') // script is ignored by Intl.Locale
			expect(normalizeLocale('sr-Cyrl-CS')).toBe('sr-Cyrl-RS') // CS is converted to RS by Intl.Locale
			expect(normalizeLocale('sr-Cyrl-RS')).toBe('sr-Cyrl-RS')
			expect(normalizeLocale('in-FILES-lalaland')).toBe('id') // FILES and lalaland are ignored
		})

		it('normalizeLocale language is und', () => {
			expect(normalizeLocale('und')).toBeNull()
		})
	})

	describe('getLanguageNameInEnglish', () => {
		it('get language name in English', () => {
			expect(getLanguageNameInEnglish('es')).toBe('Spanish')
			expect(getLanguageNameInEnglish('en')).toBe('English')
			expect(getLanguageNameInEnglish('en-US')).toBe('English (United States)')
			expect(getLanguageNameInEnglish('bs-Latn-BA')).toBe('Bosnian (Latin, Bosnia & Herzegovina)')
		})

		it('wrong tag', () => {
			expect(getLanguageNameInEnglish('')).toBeNull()
			expect(getLanguageNameInEnglish('3141516')).toBeNull()
		})
	})

	describe('getLocalisedLanguageName', () => {
		it('get language name in French', () => {
			expect(getLocalisedLanguageName('es', 'fr')).toBe('espagnol')
			expect(getLocalisedLanguageName('en-US', 'fr')).toBe('anglais (États-Unis)')
			expect(getLocalisedLanguageName('en-US', 'fr', { languageDisplay: 'dialect' })).toBe(
				'anglais américain',
			)
			expect(getLocalisedLanguageName('bs-Latn-BA', 'fr')).toBe(
				'bosniaque (latin, Bosnie-Herzégovine)',
			)
		})

		it('wrong tag', () => {
			expect(getLocalisedLanguageName('', 'en')).toBeNull()
			expect(getLocalisedLanguageName('3141516', 'en')).toBeNull()
		})

		it('wrong destination tag', () => {
			expect(getLocalisedLanguageName('fr', 'wow')).toBeNull()
			expect(getLocalisedLanguageName('fr', 'wow')).toBeNull()
		})
	})
})
