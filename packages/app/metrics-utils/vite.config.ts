import { resolve } from 'node:path'

import defineConfig from '@lokalise/package-vite-config/package'

// @ts-ignore
import packageJson from './package.json'
import dtsPlugin from "vite-plugin-dts";

// biome-ignore lint/style/noDefaultExport: vite expects default export
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  dependencies: Object.keys(packageJson.peerDependencies),
  plugins: [dtsPlugin({ tsconfigPath: './tsconfig.build.json' })],
  test: {
    coverage: {
      exclude: ['src/**/index.ts', 'src/**/*.spec.ts'],
      provider: 'v8',
      thresholds: {
        lines: 99,
        functions: 99,
        branches: 84,
        statements: 99,
      },
    },
  },
})
