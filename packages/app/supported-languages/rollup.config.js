/**
 * We use Rollup for its ability to create tree-shakable EcmaScript module.
 */

import { createRequire } from 'node:module'
import { dirname } from 'node:path'

import typescript from '@rollup/plugin-typescript'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

// eslint-disable-next-line import/no-default-export
export default {
	input: 'src/index.ts',
	output: [
		{
			dir: dirname(packageJson.module),
			format: 'cjs', // Output CommonJS for server side rendered apps.
			sourcemap: true, // Generate source map so the consumer of Louis can explore the code also in their app.
			preserveModules: true,
			entryFileNames: 'cjs/[name].cjs',
		},
		{
			dir: dirname(packageJson.module),
			format: 'esm', // Output EcmaScript Modules for modern applications for running in browser environment.
			sourcemap: true, // Generate source map so the consumer of Louis can explore the code also in their app.
			interop: 'compat',
			preserveModules: true,
		},
	],
	external: Object.keys(packageJson.dependencies || {}),
	plugins: [typescript()],
}
