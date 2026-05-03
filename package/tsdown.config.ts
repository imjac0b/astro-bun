import { defineConfig } from 'tsdown';

export default defineConfig(({ watch = false }) => ({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    server: 'src/server/index.ts',
    middleware: 'src/middleware.ts',
  },
  format: 'esm',
  splitting: false,
  watch,
  minify: !watch,
}));
