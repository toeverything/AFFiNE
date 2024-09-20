// this script is used to clean up the unused keys in the i18n file
// just run `node packages/frontend/i18n/cleanup.mjs`

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { glob } from 'glob';

const REPO_ROOT = path.resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  '..'
);

const files = await glob('packages/frontend/**/src/**/*.{js,tsx,ts}', {
  ignore: [
    '**/node_modules/**',
    '**/packages/frontend/i18n/src/resources/*',
    '**/dist/**',
    '**/lib/**',
  ],
  cwd: REPO_ROOT,
  absolute: true,
});

const filesWithContent = files.map(file => {
  return {
    path: file,
    content: fs.readFileSync(file, 'utf8'),
  };
});

const enjson = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'packages/frontend/i18n/src/resources/en.json'),
    'utf8'
  )
);

const keys = Object.keys(enjson).filter(
  // exceptions
  key => !key.startsWith('com.affine.payment.modal.')
);

const unusedKeys = keys.filter(key => {
  const regex1 = new RegExp(`[\`'"]${key.replace('.', '\\.')}[\`'"]`, 'g');
  // some place use i18n key like `t[`com.affine.modal.${var}`]`
  // com.affine.modal.confirm -> com.affine.modal.
  const keyWithoutLastDot = key.replace(/(?<=\.)[^.]+$/, '');
  const regex2 = new RegExp(
    `[\`'"]${keyWithoutLastDot.replace('.', '\\.')}`,
    'g'
  );
  for (const file of filesWithContent) {
    const match = file.content.match(regex1) || file.content.match(regex2);
    if (match) {
      return false;
    }
  }
  return true;
});

for (const key of unusedKeys) {
  delete enjson[key];
}

// write back to file
fs.writeFileSync(
  path.join(REPO_ROOT, 'packages/frontend/i18n/src/resources/en.json'),
  JSON.stringify(enjson, null, 2)
);
