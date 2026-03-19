import { languages } from './languages.ts'
import { lokaliseSupportedLanguagesAndLocales } from './lokalise-languages.ts'
import { regions } from './regions.ts'
import { scripts } from './scripts.ts'
import { standardLocales } from './standard-locales.ts'

export const getAllLanguages = () => [...languages]
export const getAllRegions = () => [...regions]
export const getAllScripts = () => [...scripts]
export const getStandardLocales = () => [...standardLocales]
export const getLokaliseSupportedLanguagesAndLocales = () => [
  ...lokaliseSupportedLanguagesAndLocales,
]
