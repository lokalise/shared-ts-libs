import { languages } from './languages.ts'
import { lokaliseSupportedLanguagesAndLocales } from './lokalise-languages.ts'
import { regions } from './regions.ts'
import { scripts } from './scripts.ts'
import { standardLocales } from './standard-locales.ts'

export const getAllLanguages = () => Array.from(languages)
export const getAllRegions = () => Array.from(regions)
export const getAllScripts = () => Array.from(scripts)
export const getStandardLocales = () => Array.from(standardLocales)
export const getLokaliseSupportedLanguagesAndLocales = () =>
  Array.from(lokaliseSupportedLanguagesAndLocales)
