import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

// @ts-ignore
import packageJson from './package.json'

export default defineConfig({
	entry: resolve(__dirname, 'src/index.ts'),
	dependencies: Object.keys(packageJson.dependencies),
	test: {
		coverage: {
			provider: 'v8',
			all: false,
			exclude: ['**/*.spec.ts'],
			thresholds: {
				lines: 98,
				functions: 98,
				branches: 90,
				statements: 98,
			},
		},
	},
})
