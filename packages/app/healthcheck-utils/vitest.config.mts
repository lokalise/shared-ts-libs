import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

import packageJson from './package.json'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  dependencies: Object.keys(packageJson.dependencies),
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
      exclude: ['src/AbstractPeriodicJob.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
