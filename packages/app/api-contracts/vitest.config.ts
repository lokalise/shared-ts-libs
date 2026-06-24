import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: vitest expects this
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    mockReset: true,
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        // Type-only modules — no runtime code to cover.
        'src/typeUtils.ts',
        'src/new/clientTypes.ts',
        'src/new/inferTypes.ts',
        'src/sse/sseTypes.ts',
        'src/sse/sseContracts.ts',
        'src/sse/dualModeContracts.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 92,
        statements: 100,
      },
    },
    typecheck: {
      enabled: true,
      include: ['src/**/*.spec.ts'],
    },
  },
})
