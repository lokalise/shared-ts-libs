import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    restoreMocks: true,
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/node.ts'],
      thresholds: {
        lines: 42,
        functions: 33,
        branches: 52,
        statements: 42,
      },
    },
  },
})
