import { resolve } from 'path'

import defineConfig from '@lokalise/package-vite-config/package'

import packageJson from './package.json'

/* eslint-disable import/no-default-export */
export default defineConfig({
	entry: resolve(__dirname, 'src/index.ts'),
	dependencies: Object.keys(packageJson.dependencies),
	test: {
		coverage: {
			exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*Types.ts', 'src/bugsnag.ts', 'src/index.ts'],
		},
	},
})
