import { getSnsTags } from './sns.ts'

describe('getSnsTags', () => {
  it('should build tags wth expected keys and values', () => {
    expect(
      getSnsTags({
        service: 'lokalise service',
        owner: 'lokalise team',
        appEnv: 'production',
        project: 'lokalise project',
        system: 'lokalise system',
      }),
    ).toEqual([
      { Key: 'env', Value: 'live' },
      { Key: 'project', Value: 'lokalise project' },
      { Key: 'service', Value: 'sns' },
      { Key: 'lok-owner', Value: 'lokalise team' },
      { Key: 'lok-cost-system', Value: 'lokalise system' },
      { Key: 'lok-cost-service', Value: 'lokalise service' },
    ])
  })
})
