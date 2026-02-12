import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    mockReset: true,
    setupFiles: ['./test/setup.ts'],
    pool: 'threads',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/types.ts',
        'src/background-job-processor/public-utils/enrichRedisConfig.ts',
        'test',
        '**/*.spec.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 98,
        functions: 95,
        branches: 87,
        statements: 96,
      },
    },
  },
})
