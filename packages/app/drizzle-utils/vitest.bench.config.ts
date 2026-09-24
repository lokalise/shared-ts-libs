import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config.ts'

// `vitest run` with this config seeds the dataset; `vitest bench` measures against it.
// The test options are spread rather than passed to `mergeConfig`, which would append
// `include` to the base config's list and run the unit tests with the seed.
// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['bench/seed.ts'],
    benchmark: { include: ['bench/**/*.bench.ts'] },
  },
})
