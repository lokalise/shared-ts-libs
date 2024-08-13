import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

import packageJson from './package.json'

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  dependencies: Object.keys(packageJson.dependencies),
})
