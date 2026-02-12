import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
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
        lines: 72,
        functions: 48,
        branches: 72,
        statements: 71,
      },
    },
  },
})
