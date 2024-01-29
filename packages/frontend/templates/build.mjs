import fs from 'node:fs';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as glob from 'glob';

// purpose: bundle all json files into one json file in onboarding folder
const __dirname = join(fileURLToPath(import.meta.url), '..');

const jsonFiles = glob.sync('./*.json', {
  cwd: path.join(__dirname, 'onboarding'),
});

const imports = jsonFiles
  .map(
    (fileName, index) => `import json_${index} from './onboarding/${fileName}';`
  )
  .join('\n');

const exports = `export const onboarding = {
${jsonFiles
  .map((fileName, index) => {
    return `  '${fileName}': json_${index}`;
  })
  .join(',\n')}
}`;

const template = `/* eslint-disable simple-import-sort/imports */
// Auto generated, do not edit manually
${imports}\n\n${exports}`;

fs.writeFileSync(path.join(__dirname, 'templates.gen.ts'), template);
