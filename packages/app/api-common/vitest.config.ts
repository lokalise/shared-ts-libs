import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  test: {
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
