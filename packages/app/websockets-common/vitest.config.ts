import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['src/types', 'src/events', 'src/index.ts', 'src/utils/schemaUtils.ts'],
    },
  },
})
