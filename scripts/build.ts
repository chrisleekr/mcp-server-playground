export {};

const isProduction = process.env['NODE_ENV'] === 'production';

const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',
  minify: isProduction,
  sourcemap: isProduction ? 'external' : 'inline',
  splitting: false,
  naming: 'index.js',
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('Build completed successfully');
