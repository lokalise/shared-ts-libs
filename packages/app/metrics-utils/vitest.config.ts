import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.spec.ts'],
      provider: 'v8',
      thresholds: {
        lines: 99,
        functions: 99,
        branches: 84,
        statements: 99,
      },
    },
  },
})
