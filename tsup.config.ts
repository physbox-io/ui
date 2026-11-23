import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/suite.ts', 'src/cloud.ts', 'src/tailwind-preset.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
