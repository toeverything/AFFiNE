import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DEFAULT_CANVAS_TEXT_FONT_CONFIG } from '@blocksuite/blocks/dist/surface-block/consts.js';

const fontPath = join(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  'packages',
  'frontend',
  'core',
  'dist',
  'assets'
);

await Promise.all(
  DEFAULT_CANVAS_TEXT_FONT_CONFIG.map(async ({ url }) => {
    const buffer = await fetch(url).then(res =>
      res.arrayBuffer().then(res => Buffer.from(res))
    );
    const filename = url.split('/').pop();
    const distPath = join(fontPath, filename);
    await writeFile(distPath, buffer);
    console.info(`Downloaded ${distPath} successfully`);
  })
);
