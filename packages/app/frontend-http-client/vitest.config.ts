import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects a default export
export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      exclude: ['src/index.ts', 'src/utils/either.ts'],
      reporter: ['lcov', 'text'],
      all: true,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
