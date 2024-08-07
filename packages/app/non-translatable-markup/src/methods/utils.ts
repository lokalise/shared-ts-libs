import { NON_TRANSLATABLE_END_TAG, NON_TRANSLATABLE_START_TAG } from '../nonTranslatableTags'

const nonTranslatableTextPattern = `${NON_TRANSLATABLE_START_TAG}.*?${NON_TRANSLATABLE_END_TAG}`
const nonTranslatableTagsPattern = `[${NON_TRANSLATABLE_START_TAG}${NON_TRANSLATABLE_END_TAG}]`
const symbolsPattern = /[¡!¿?@#$%^&*/\\|"'`´)(\]\[}{><+=.,_-]/

export const nonTranslatableTextRegexp = new RegExp(nonTranslatableTextPattern)
export const nonTranslatableTextRegexpG = new RegExp(nonTranslatableTextPattern, 'g')
export const nonTranslatableTagsRegexpG = new RegExp(nonTranslatableTagsPattern, 'g')
export const symbolsRegexp = new RegExp(symbolsPattern)
