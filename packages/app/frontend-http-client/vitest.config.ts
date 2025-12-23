import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects a default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    mockReset: true,
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 99,
        functions: 96,
        branches: 100,
        statements: 99,
      },
    },
  },
})
