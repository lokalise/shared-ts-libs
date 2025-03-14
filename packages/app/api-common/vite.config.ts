import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'
import dtsPlugin from 'vite-plugin-dts'

// @ts-ignore
import packageJson from './package.json'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  dependencies: Object.keys(packageJson.peerDependencies),
  plugins: [dtsPlugin({ tsconfigPath: './tsconfig.build.json' })],
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 92,
        statements: 100,
      },
    },
  },
})
