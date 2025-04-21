import { getSqsTags } from './sqs.ts'

describe('getSqsTags', () => {
  it('should build tags wth expected keys and values', () => {
    expect(
      getSqsTags({
        service: 'lokalise service',
        owner: 'lokalise team',
        appEnv: 'staging',
        project: 'lokalise project',
        system: 'lokalise system',
      }),
    ).toEqual({
      env: 'stage',
      project: 'lokalise project',
      service: 'sqs',
      'lok-owner': 'lokalise team',
      'lok-cost-system': 'lokalise system',
      'lok-cost-service': 'lokalise service',
    })
  })
})
