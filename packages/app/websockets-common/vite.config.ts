import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

import packageJson from './package.json'

/* eslint-disable import/no-default-export */
export default defineConfig({
	entry: resolve(__dirname, 'src/index.ts'),
	dependencies: Object.keys(packageJson.dependencies),
	test: {
		coverage: {
			exclude: ['src/types', 'src/events', 'src/index.ts', 'src/utils/schemaUtils.ts'],
		},
	},
})
