import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    watch: false,
    environment: 'node',
    restoreMocks: true,
    setupFiles: ['test/envSetupHook.ts'],
    reporters: ['default'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/types.ts',
        'src/**/*.spec.ts'
      ],
      reporter: ['text'],
      all: true,
      thresholds: {
        lines: 95,
        functions: 75,
        branches: 80,
        statements: 95,
      },
    },
  },
})
