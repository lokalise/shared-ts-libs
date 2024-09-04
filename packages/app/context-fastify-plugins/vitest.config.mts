import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

// @ts-ignore
import packageJson from './package.json'

// biome-ignore lint/style/noDefaultExport: <explanation>
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
      thresholds: {
        lines: 70,
        functions: 55,
        branches: 90,
        statements: 70,
      },
    },
  },
})
