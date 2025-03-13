import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    restoreMocks: true,
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
      },
    },
    coverage: {
      provider: 'v8',
      all: false,
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
