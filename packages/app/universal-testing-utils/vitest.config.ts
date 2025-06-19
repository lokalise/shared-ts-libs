import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vitest expects default export
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
        lines: 90,
        functions: 100,
        branches: 80,
        statements: 90,
      },
    },
  },
})
