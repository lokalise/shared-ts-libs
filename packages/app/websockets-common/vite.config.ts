import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

// @ts-ignore
import packageJson from './package.json'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  dependencies: Object.keys(packageJson.dependencies),
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['src/types', 'src/events', 'src/index.ts', 'src/utils/schemaUtils.ts'],
    },
  },
})
