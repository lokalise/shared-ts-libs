import { defineConfig } from 'tsup'

// biome-ignore lint/style/noDefaultExport:
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outDir: 'dist',
  clean: true,
  dts: true,
  sourcemap: true,
})
