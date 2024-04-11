import { resolve } from 'path'

import defineConfig from '@lokalise/package-vite-config/package'

import packageJson from './package.json'

/* eslint-disable import/no-default-export */
export default defineConfig({
	entry: resolve(__dirname, 'src/index.ts'),
	dependencies: Object.keys(packageJson.dependencies),
	test: {
		setupFiles: ['./test/setup.ts'],
		hookTimeout: 60000,
		restoreMocks: true,
		poolOptions: {
			threads: {
				singleThread: true,
				isolate: false,
			},
		},
		coverage: {
			all: false,
			thresholds: {
				lines: 98,
				functions: 100,
				branches: 90,
				statements: 98,
			},
		},
	},
})
