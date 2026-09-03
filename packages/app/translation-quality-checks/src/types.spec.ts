import { expectTypeOf } from 'vitest'
import type { QualityIssue, QualityIssueError, QualityIssueErrorEnum } from './types.ts'

type DetailsOf<Error extends QualityIssueError> = Extract<QualityIssue, { error: Error }>['details']

describe('QualityIssue type contract', () => {
  it('narrows details by error code', () => {
    expectTypeOf<DetailsOf<'LEADING_WHITESPACE'>>().toEqualTypeOf<undefined>()
    expectTypeOf<DetailsOf<'TRAILING_WHITESPACE'>>().toEqualTypeOf<undefined>()
    expectTypeOf<DetailsOf<'DOUBLE_WHITESPACE'>>().toEqualTypeOf<{ whitespaces: string[] }>()
    expectTypeOf<DetailsOf<'LEADING_WHITESPACE_MISMATCH'>>().toEqualTypeOf<{
      source: string
      target: string
    }>()
    expectTypeOf<DetailsOf<'TRAILING_WHITESPACE_MISMATCH'>>().toEqualTypeOf<{
      source: string
      target: string
    }>()
    expectTypeOf<DetailsOf<'DOUBLE_WHITESPACE_MISMATCH'>>().toEqualTypeOf<{
      missing: string[]
      added: string[]
    }>()
    expectTypeOf<DetailsOf<'NON_TRANSLATABLE_TAGS_MISMATCH'>>().toEqualTypeOf<{
      missing: string[]
      added: string[]
    }>()
  })

  it('keeps the error enum in sync with the issue union', () => {
    expectTypeOf<keyof typeof QualityIssueErrorEnum>().toEqualTypeOf<QualityIssueError>()
    expectTypeOf<
      (typeof QualityIssueErrorEnum)[keyof typeof QualityIssueErrorEnum]
    >().toEqualTypeOf<QualityIssueError>()
  })
})
