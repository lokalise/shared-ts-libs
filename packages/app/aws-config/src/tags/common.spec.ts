import { expect, expectTypeOf, it } from 'vitest'
import { type AwsTagsParams, buildResourceTags } from './common.ts'

describe('tags common', () => {
  describe('AwsTagsParams', () => {
    it('should accept as default for generics', () => {
      const params: AwsTagsParams = {
        appEnv: 'production',
        owner: 'lokalise team',
        service: 'lokalise service',
        project: 'lokalise project',
        system: 'lokalise system',
      }

      expectTypeOf(params).toEqualTypeOf<AwsTagsParams<string, string, string, string>>()
    })

    it('should respect generics', () => {
      type CorrectTags = AwsTagsParams<'system', 'owner', 'project', 'service'>

      const params: CorrectTags = {
        appEnv: 'development',
        owner: 'owner',
        service: 'service',
        project: 'project',
        system: 'system',
      }
      expectTypeOf(params).toEqualTypeOf<CorrectTags>()
      expectTypeOf(params).not.toEqualTypeOf<AwsTagsParams>()
    })
  })

  describe('buildResourceTags', () => {
    it.each([
      ['development', 'dev'],
      ['staging', 'stage'],
      ['production', 'live'],
    ])('should build base tags for AWS resources', (appEnv, tagEnv) => {
      expect(
        buildResourceTags(
          {
            appEnv: appEnv as any,
            service: 'lokalise service',
            owner: 'lokalise team',
            project: 'lokalise project',
            system: 'lokalise system',
          },
          'awsService',
        ),
      ).toEqual({
        env: tagEnv,
        project: 'lokalise project',
        service: 'awsService',
        'lok-owner': 'lokalise team',
        'lok-cost-system': 'lokalise system',
        'lok-cost-service': 'lokalise service',
      })
    })
  })
})
