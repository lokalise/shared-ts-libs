import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
	test: {
		globals: true,
		watch: false,
		restoreMocks: true,
		pool: 'threads',
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/index.ts'],
			thresholds: {
				lines: 84,
				functions: 80,
				branches: 86,
				statements: 84,
			},
		},
	},
})
