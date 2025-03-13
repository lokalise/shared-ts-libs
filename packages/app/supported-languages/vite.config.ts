import { resolve } from 'node:path'
import defineConfig from '@lokalise/package-vite-config/package'
import dtsPlugin from 'vite-plugin-dts'

// biome-ignore lint/style/noDefaultExport: <explanation>
export default defineConfig({
  entry: resolve(__dirname, 'src/index.ts'),
  plugins: [dtsPlugin({ tsconfigPath: './tsconfig.build.json' })],
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
