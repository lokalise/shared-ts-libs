import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    hookTimeout: 60000,
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
      all: false,
      exclude: ['src/**/types.ts', 'test', '**/*.spec.ts'],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 90,
        statements: 98,
      },
    },
  },
})
