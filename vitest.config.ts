import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/app/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
