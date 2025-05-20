// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: This is expected by vitest
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    environment: 'node',
    restoreMocks: true,
    reporters: ['default'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text'],
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
