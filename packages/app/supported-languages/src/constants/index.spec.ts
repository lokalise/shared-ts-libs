import { describe, expect, it } from 'vitest'
import {
  getAllLanguages,
  getAllRegions,
  getAllScripts,
  getLokaliseSupportedLanguagesAndLocales,
  getStandardLocales,
} from './index.ts'

describe('getAllLanguages', () => {
  it('returns a non-empty array', () => {
    expect(getAllLanguages().length).toBeGreaterThan(0)
  })
})

describe('getAllRegions', () => {
  it('returns a non-empty array', () => {
    expect(getAllRegions().length).toBeGreaterThan(0)
  })
})

describe('getAllScripts', () => {
  it('returns a non-empty array', () => {
    expect(getAllScripts().length).toBeGreaterThan(0)
  })
})

describe('getStandardLocales', () => {
  it('returns a non-empty array', () => {
    expect(getStandardLocales().length).toBeGreaterThan(0)
  })
})

describe('getLokaliseSupportedLanguagesAndLocales', () => {
  it('returns a non-empty array', () => {
    expect(getLokaliseSupportedLanguagesAndLocales().length).toBeGreaterThan(0)
  })
})
