import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    watch: false,
    mockReset: true,
    restoreMocks: true,
    fileParallelism: false,
    pool: 'forks',
    environment: 'node',
    setupFiles: ['test/envSetupHook.ts'],
    include: ['src/**/*.test.ts'],
    exclude: [],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
