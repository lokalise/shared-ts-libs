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
      // The CLI is half of what this package ships, and every bug it had went
      // unnoticed while it sat outside the thresholds.
      include: ['src/**/*.ts', 'bin/**/*.mjs'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
})
