import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vitest config requires default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    mockReset: true,
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 85,
        functions: 75,
        branches: 70,
        statements: 85,
      },
    },
  },
})
