import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  resolve: {
    alias: {
      // Prisma 7's new `prisma-client` generator outputs raw TypeScript files to node_modules/db-client
      // without a package.json, so Node cannot resolve `db-client/*` imports as a package.
      // The output is intentionally placed in node_modules so tsc excludes it from the compiled output.
      // This alias points the resolver directly at the generated directory.
      'db-client': path.resolve(__dirname, 'node_modules/db-client'),
    },
  },
  test: {
    globals: true,
    watch: false,
    mockReset: true,
    pool: 'threads',
    maxWorkers: 1,
    setupFiles: ['test/envSetupHook.ts'],
    hookTimeout: 30000,
    teardownTimeout: 10000,
    coverage: {
      enabled: false,
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        lines: 45,
        functions: 42,
        branches: 80,
        statements: 45,
      },
    },
  },
})
