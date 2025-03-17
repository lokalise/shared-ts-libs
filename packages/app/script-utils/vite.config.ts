import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'
import dtsPlugin from 'vite-plugin-dts'

// @ts-ignore
import packageJson from './package.json'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  dependencies: Object.keys(packageJson.dependencies),
  plugins: [dtsPlugin({ tsconfigPath: './tsconfig.build.json' })],
})
