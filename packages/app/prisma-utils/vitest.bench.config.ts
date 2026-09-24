import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config.ts'

// `vitest run` with this config seeds the dataset; `vitest bench` measures against it.
// biome-ignore lint/style/noDefaultExport: vite expects default export
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['bench/seed.ts'],
      benchmark: { include: ['bench/**/*.bench.ts'] },
    },
  }),
)
