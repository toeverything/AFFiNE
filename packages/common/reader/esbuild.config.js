import fs from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';

const result = await build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  target: 'es2024',
  sourcemap: true,
  format: 'esm',
  external: ['yjs'],
  metafile: true,
});

if (process.env.METAFILE) {
  await fs.writeFile(
    path.resolve(`metafile-${Date.now()}.json`),
    JSON.stringify(result.metafile, null, 2)
  );
}
