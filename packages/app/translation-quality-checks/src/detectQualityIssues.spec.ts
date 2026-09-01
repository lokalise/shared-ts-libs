import { detectQualityIssues } from './detectQualityIssues.ts'

describe('detectQualityIssues', () => {
  describe('single-text call', () => {
    it('returns no issues for a clean text', () => {
      expect(detectQualityIssues('Hola')).toEqual([])
    })

    it('aggregates every single-text issue found', () => {
      expect(detectQualityIssues(' Hola  mundo ')).toEqual([
        { error: 'LEADING_WHITESPACE', details: undefined },
        { error: 'TRAILING_WHITESPACE', details: undefined },
        { error: 'DOUBLE_WHITESPACE', details: { whitespaces: ['  '] } },
      ])
    })

    it('never runs the mismatch checks', () => {
      expect(detectQualityIssues('Hola', { checksToInclude: ['LEADING_WHITESPACE'] })).toEqual([])
    })

    it('checksToExclude skips the given checks', () => {
      expect(detectQualityIssues(' Hola ', { checksToExclude: ['LEADING_WHITESPACE'] })).toEqual([
        { error: 'TRAILING_WHITESPACE', details: undefined },
      ])
    })

    it('checksToInclude runs only the given checks', () => {
      expect(detectQualityIssues(' Hola ', { checksToInclude: ['LEADING_WHITESPACE'] })).toEqual([
        { error: 'LEADING_WHITESPACE', details: undefined },
      ])
    })

    it('checksToExclude wins over checksToInclude on overlap', () => {
      expect(
        detectQualityIssues(' Hola', {
          checksToInclude: ['LEADING_WHITESPACE'],
          checksToExclude: ['LEADING_WHITESPACE'],
        }),
      ).toEqual([])
    })

    it('an empty checksToInclude falls back to running every check', () => {
      expect(detectQualityIssues(' Hola', { checksToInclude: [] })).toEqual([
        { error: 'LEADING_WHITESPACE', details: undefined },
      ])
    })

    it('duplicated entries in checksToInclude run the check only once', () => {
      expect(
        detectQualityIssues(' Hola', {
          checksToInclude: ['LEADING_WHITESPACE', 'LEADING_WHITESPACE'],
        }),
      ).toEqual([{ error: 'LEADING_WHITESPACE', details: undefined }])
    })

    it('runs every check listed in checksToInclude, in no guaranteed order', () => {
      const issues = detectQualityIssues(' Hola ', {
        checksToInclude: ['TRAILING_WHITESPACE', 'LEADING_WHITESPACE'],
      })

      expect(issues).toHaveLength(2)
      expect(issues).toEqual(
        expect.arrayContaining([
          { error: 'LEADING_WHITESPACE', details: undefined },
          { error: 'TRAILING_WHITESPACE', details: undefined },
        ]),
      )
    })
  })

  describe('text/compareWith pair call', () => {
    it('returns no issues for a clean pair', () => {
      expect(detectQualityIssues('Hola', 'Hello')).toEqual([])
    })

    it('aggregates the mismatch issues and the single-text issues on the text', () => {
      expect(detectQualityIssues(' Hola', 'Hello')).toEqual([
        { error: 'LEADING_WHITESPACE_MISMATCH', details: { source: '', target: ' ' } },
        { error: 'LEADING_WHITESPACE', details: undefined },
      ])
    })

    it('does not run the single-text checks on the compared text', () => {
      expect(detectQualityIssues('Hola', ' Hello ')).toEqual([
        { error: 'LEADING_WHITESPACE_MISMATCH', details: { source: ' ', target: '' } },
        { error: 'TRAILING_WHITESPACE_MISMATCH', details: { source: ' ', target: '' } },
      ])
    })

    it('checksToExclude skips the given checks', () => {
      expect(
        detectQualityIssues(' Hola', 'Hello', {
          checksToExclude: ['LEADING_WHITESPACE_MISMATCH'],
        }),
      ).toEqual([{ error: 'LEADING_WHITESPACE', details: undefined }])
    })

    it('checksToInclude runs only the given checks', () => {
      expect(
        detectQualityIssues(' Hola', 'Hello', { checksToInclude: ['LEADING_WHITESPACE'] }),
      ).toEqual([{ error: 'LEADING_WHITESPACE', details: undefined }])
    })

    it('checksToExclude wins over checksToInclude on overlap', () => {
      expect(
        detectQualityIssues(' Hola', 'Hello', {
          checksToInclude: ['LEADING_WHITESPACE_MISMATCH'],
          checksToExclude: ['LEADING_WHITESPACE_MISMATCH'],
        }),
      ).toEqual([])
    })

    it('skipSingleTextChecks runs only the mismatch checks', () => {
      expect(detectQualityIssues(' Hola', 'Hello', { skipSingleTextChecks: true })).toEqual([
        { error: 'LEADING_WHITESPACE_MISMATCH', details: { source: '', target: ' ' } },
      ])
    })

    it('skipSingleTextChecks composes with checksToExclude', () => {
      expect(
        detectQualityIssues(' Hola ', 'Hello', {
          skipSingleTextChecks: true,
          checksToExclude: ['LEADING_WHITESPACE_MISMATCH'],
        }),
      ).toEqual([{ error: 'TRAILING_WHITESPACE_MISMATCH', details: { source: '', target: ' ' } }])
    })
  })
})
