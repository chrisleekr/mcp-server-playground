const { BannerPlugin, SwcJsMinimizerRspackPlugin } = require('@rspack/core');
const path = require('path');

/** @type {import('@rspack/cli').Configuration} */
module.exports = {
  entry: './src/index.ts',
  target: 'node',
  mode: process.env.NODE_ENV === 'prod' ? 'production' : 'development',

  plugins: [
    // Add shebang to the entry file
    // Reference: https://rspack.rs/plugins/webpack/banner-plugin#bannerplugin
    new BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
      entryOnly: true,
    }),
  ],

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    clean: true,
    libraryTarget: 'commonjs2',
  },

  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/types': path.resolve(__dirname, 'src/types'),
      '@/core': path.resolve(__dirname, 'src/core'),
      '@/config': path.resolve(__dirname, 'src/config'),
      '@/tools': path.resolve(__dirname, 'src/tools'),
      '@/utils': path.resolve(__dirname, 'src/utils'),
    },
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  decorators: true,
                },
                target: 'es2022',
                loose: false,
                externalHelpers: false,
              },
              module: {
                type: 'commonjs',
              },
              sourceMaps: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },

  // Reference: https://rspack.rs/config/optimization
  optimization: {
    minimize: process.env.NODE_ENV === 'prod',
    moduleIds: 'deterministic',
    chunkIds: 'deterministic',
    usedExports: true,
    providedExports: true,
    sideEffects: true,
    innerGraph: true,
    concatenateModules: true,
    minimizer: [
      // Reference: https://rspack.rs/plugins/rspack/swc-js-minimizer-rspack-plugin
      new SwcJsMinimizerRspackPlugin({
        extractComments: /@preserve|@lic|@cc_on|^\**!/,
        minimizerOptions: {
          format: {
            comments: false,
          },
          compress: {
            passes: 4,
          },
        },
      }),
    ],
  },

  externals: {
    // Bundle everything
    // Don't bundle node_modules for Node.js apps
    // ...require('module').builtinModules.reduce((externals, mod) => {
    //   externals[mod] = `commonjs ${mod}`;
    //   return externals;
    // }, {}),
  },

  devtool: process.env.NODE_ENV === 'prod' ? 'source-map' : 'eval-source-map',

  devServer: {
    // Not used for Node.js apps, but keeping for consistency
    port: 3000,
    hot: false,
  },

  experiments: {
    outputModule: false,
  },

  stats: {
    preset: 'normal',
    colors: true,
  },
  ignoreWarnings: [
    // Ignore `./node_modules/express/lib/view.js Critical dependency: the request of a dependency is an expression`
    /critical dependency: the request of a dependency is an expression/,
    warning => true,
  ],
};
