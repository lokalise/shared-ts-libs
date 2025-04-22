import { snsPrefixTransformer, sqsPrefixTransformer } from './prefixTransformer.ts'

describe('prefixTransformer', () => {
  describe('snsPrefixTransformer', () => {
    it('should return the SNS ARN with wildcard', () => {
      expect(snsPrefixTransformer('my-topic')).toBe('arn:aws:sns:*:*:my-topic*')
    })

    it('should return the SNS ARN if already ends with a wildcard', () => {
      expect(snsPrefixTransformer('my-topic*')).toBe('arn:aws:sns:*:*:my-topic*')
    })
  })

  describe('sqsPrefixTransformer', () => {
    it('should return an array of SQS ARNs with wildcards', () => {
      const result = sqsPrefixTransformer(['queue1', 'queue2'])
      expect(result).toEqual(['arn:aws:sqs:*:*:queue1*', 'arn:aws:sqs:*:*:queue2*'])
    })

    it('should return an array of SQS ARNs where some already have wildcards', () => {
      const result = sqsPrefixTransformer(['queue1*', 'queue2'])
      expect(result).toEqual(['arn:aws:sqs:*:*:queue1*', 'arn:aws:sqs:*:*:queue2*'])
    })
  })
})
