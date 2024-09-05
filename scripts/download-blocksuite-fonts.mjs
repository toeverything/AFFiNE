import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AffineCanvasTextFonts } from '@blocksuite/affine-block-surface';

const fontPath = join(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  'packages',
  'frontend',
  'web',
  'dist',
  'assets'
);

await Promise.all(
  AffineCanvasTextFonts.map(async ({ url }) => {
    const buffer = await fetch(url).then(res =>
      res.arrayBuffer().then(res => Buffer.from(res))
    );
    const filename = url.split('/').pop();
    const distPath = join(fontPath, filename);
    await writeFile(distPath, buffer);
    console.info(`Downloaded ${distPath} successfully`);
  })
);
