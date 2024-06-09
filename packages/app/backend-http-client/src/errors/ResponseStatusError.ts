import { InternalError } from '@lokalise/node-core'
import type { RequestResult } from 'undici-retry'

export function isResponseStatusError(entity: unknown): entity is ResponseStatusError {
	return 'isResponseStatusError' in (entity as ResponseStatusError)
}

export class ResponseStatusError extends InternalError {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly response: RequestResult<any>
	public readonly isResponseStatusError = true

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(requestResult: RequestResult<any>, requestLabel = 'N/A') {
		super({
			message: `Response status code ${requestResult.statusCode}`,
			details: {
				requestLabel,
				response: {
					statusCode: requestResult.statusCode,
					body: requestResult.body,
				},
			},
			errorCode: 'REQUEST_ERROR',
		})
		this.response = requestResult
		this.name = 'ResponseStatusError'
	}
}
