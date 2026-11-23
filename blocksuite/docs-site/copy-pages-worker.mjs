import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

copyFileSync(
  join(process.cwd(), 'pages-worker.mjs'),
  join(process.cwd(), '.vitepress', 'dist', '_worker.js')
);
