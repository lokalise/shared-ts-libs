import { resolve } from 'path'

import defineConfig from '@lokalise/package-vite-config/package'

import packageJson from './package.json'

/* eslint-disable import/no-default-export */
export default defineConfig({
	entry: resolve(__dirname, 'src/index.ts'),
	dependencies: Object.keys(packageJson.peerDependencies),
	test: {
		coverage: {
			exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*Types.ts', 'src/**/*types.ts'],
			thresholds: {
				lines: 96,
				functions: 0, // not applicable
				branches: 0, // not applicable
				statements: 96,
			},
		},
	},
})
