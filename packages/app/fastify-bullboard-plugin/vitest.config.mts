import { configDefaults, defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
	test: {
		globals: true,
		poolOptions: {
			threads: {
				singleThread: true,
				isolate: false,
			},
		},
		pool: 'threads',
		watch: false,
		environment: 'node',
		setupFiles: ['test/dotenvConfig.ts'],
		reporters: ['default'],
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: [
				'src/infrastructure/db-client/**/*',
				'src/infrastructure/diConfig.ts',
				'src/infrastructure/errors/publicErrors.ts',
				'src/infrastructure/errors/internalErrors.ts',
				'src/schemas/commonTypes.ts',
				'src/server.ts',
				'src/app.ts',
				'src/**/*.spec.ts',
				'src/**/*.test.ts',
			],
			reporter: ['lcov', 'text-summary'],
			all: true,
			thresholds: {
				lines: 85,
				functions: 75,
				branches: 85,
				statements: 85,
			},
		},
		exclude: [...configDefaults.exclude, 'test/e2e/**/*.spec.ts', 'test/e2e/**/*.test.ts'],
	},
})
