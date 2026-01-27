import { applyAwsResourcePrefix } from './applyAwsResourcePrefix.ts'

const mockCredentials = { accessKeyId: 'test', secretAccessKey: 'test' }

describe('applyAwsResourcePrefix', () => {
  it('should return the resource name without prefix if no prefix is set', () => {
    expect(
      applyAwsResourcePrefix('my-queue', {
        region: 'us-east-1',
        kmsKeyId: 'my-kms-key-id',
        allowedSourceOwner: 'my-owner',
        credentials: mockCredentials,
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
        credentials: mockCredentials,
      }),
    ).toEqual('prefix_my-queue')
  })
})
