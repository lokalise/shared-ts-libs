import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
      },
    },
    pool: 'threads',
    coverage: {
      provider: 'v8',
      exclude: ['src/**/types.ts', 'test', '**/*.spec.ts', 'vitest.config.ts'],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 90,
        statements: 98,
      },
    },
  },
})
