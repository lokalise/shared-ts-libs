import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    restoreMocks: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
      },
    },
    setupFiles: ['test/envSetupHook.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        lines: 45,
        functions: 42,
        branches: 80,
        statements: 45,
      },
    },
  },
})
