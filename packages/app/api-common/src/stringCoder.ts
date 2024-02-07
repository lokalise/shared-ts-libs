export const encode = (value: string): string => Buffer.from(value).toString('base64url')

export const decode = (value: string): string => Buffer.from(value, 'base64url').toString('utf-8')
