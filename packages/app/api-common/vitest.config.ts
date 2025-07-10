import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: needed by vite
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
        lines: 100,
        functions: 100,
        branches: 92,
        statements: 100,
      },
    },
  },
})
