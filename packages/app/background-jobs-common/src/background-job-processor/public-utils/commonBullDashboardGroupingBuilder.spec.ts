import { describe } from 'vitest'
import { commonBullDashboardGroupingBuilder } from './commonBullDashboardGroupingBuilder.ts'

describe('commonBullDashboardGroupingBuilder', () => {
  it('should return an array with serviceId and moduleId', () => {
    const serviceId = 'service'
    const moduleId = 'module'
    expect(commonBullDashboardGroupingBuilder(serviceId, moduleId)).toEqual([serviceId, moduleId])
  })
})
