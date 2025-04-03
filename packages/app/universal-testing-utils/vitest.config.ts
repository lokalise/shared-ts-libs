import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vitest expects default export
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 71,
        functions: 100,
        branches: 75,
        statements: 71,
      },
    },
  },
})
