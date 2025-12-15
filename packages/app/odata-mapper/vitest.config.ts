import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    restoreMocks: true,
    pool: 'threads',
    // Exclude unit tests by default - run only e2e tests for coverage
    exclude: ['**/node_modules/**', '**/unit/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.spec.ts', 'src/unit/**'],
      thresholds: {
        // E2E tests focus on real parser output; error handlers and
        // alternative AST formats have lower coverage
        lines: 80,
        functions: 95,
        branches: 70,
        statements: 80,
      },
    },
  },
})
