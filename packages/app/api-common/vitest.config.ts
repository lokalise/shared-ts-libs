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
      exclude: ['src/index.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 92,
        statements: 100,
      },
    },
  },
})
