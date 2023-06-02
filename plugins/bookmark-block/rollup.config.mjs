import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import typescript from '@rollup/plugin-typescript';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default {
  input: resolve(rootDir, 'src/server.ts'),
  output: {
    dir: resolve(
      rootDir,
      '..',
      '..',
      'apps',
      'electron',
      'dist',
      'plugins',
      'bookmark-block'
    ),
    format: 'cjs',
  },
  external: ['cheerio', 'electron', 'node:url'],
  plugins: [
    typescript({
      outputToFilesystem: true,
      tsconfig: resolve(rootDir, './tsconfig.json'),
    }),
  ],
};
