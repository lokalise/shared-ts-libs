import { applyAwsResourcePrefix } from './applyAwsResourcePrefix.ts'

describe('applyAwsResourcePrefix', () => {
  it('should return the resource name without prefix if no prefix is set', () => {
    expect(
      applyAwsResourcePrefix('my-queue', {
        region: 'us-east-1',
        kmsKeyId: 'my-kms-key-id',
        allowedSourceOwner: 'my-owner',
      }),
    ).toEqual('my-queue')
  })

  it('should use the prefix if it is set', () => {
    expect(
      applyAwsResourcePrefix('my-queue', {
        region: 'us-east-1',
        kmsKeyId: 'my-kms-key-id',
        allowedSourceOwner: 'my-owner',
        resourcePrefix: 'prefix',
      }),
    ).toEqual('prefix_my-queue')
  })
})
