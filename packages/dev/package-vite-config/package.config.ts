import { builtinModules } from 'node:module'

import dts from 'vite-plugin-dts'
import { type ViteUserConfig, defineConfig } from 'vitest/config'

export const extractDependencies = (packageJson: {
  dependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}) =>
  (packageJson.dependencies ? Object.keys(packageJson.dependencies) : []).concat(
    packageJson.peerDependencies ? Object.keys(packageJson.peerDependencies) : [],
  )

// biome-ignore lint/style/noDefaultExport: vite expects a default export
export default ({
  entry,
  dependencies = [],
  test,
  ...config
}: ViteUserConfig & { dependencies?: readonly string[]; entry: string }) =>
  defineConfig({
    appType: 'custom',
    build: {
      target: 'esnext',
      lib: {
        entry: { index: entry },
      },
      rollupOptions: {
        output: [
          {
            format: 'es',
            preserveModules: true,
          },
          {
            format: 'cjs',
          },
        ],
        external: dependencies
          .flatMap((dep) => [
            // This matches `import from 'my-package'`
            dep,
            // The `dep` above only covers root imports. In order to include sub-paths
            // from dependency, we need to add a regex that matches those as well.
            // This matches `import from 'my-package/sub/path'`
            new RegExp(`^${dep}/`),
          ])
          .concat(builtinModules.flatMap((mod) => [mod, `node:${mod}`])),
        onwarn(warning) {
          throw Object.assign(new Error(), warning)
        },
      },
      commonjsOptions: {
        // Assumes all external dependencies are ESM dependencies. Just ensures
        // we then import those dependencies correctly in CJS as well.
        esmExternals: true,
      },
      sourcemap: true,
    },
    plugins: [
      dts({
        afterDiagnostic: (diagnosis) => {
          if (diagnosis.length > 0) {
            throw new Error('Issue while generating declaration files', {
              cause: diagnosis,
            })
          }
        },
        include: ['src'],
      }),
    ],
    test: {
      globals: true,
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
      watch: false,
      environment: 'node',
      ...test,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
        reporter: ['lcov', 'text'],
        all: true,
        thresholds: {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        ...(test?.coverage as Record<string, string>),
      },
    },
    ...config,
  })
