import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    restoreMocks: true,
    pool: 'threads',
    setupFiles: ['./test/setup.ts'], // TODO: check if this is needed
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts', 'test', '**/*.spec.ts', 'vitest.config.ts'],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 90,
        statements: 98,
      },
    },
  },
})
