import fs from 'node:fs';
import path from 'node:path';

import * as glob from 'glob';

// purpose: bundle all json files into one json file in onboarding folder
const __dirname = new URL('.', import.meta.url).pathname;

const jsonFiles = glob.sync('./*.json', {
  cwd: path.resolve(__dirname, 'onboarding'),
});

const imports = jsonFiles
  .map((fileName, index) => {
    return `import json_${index} from './onboarding/${fileName}';`;
  })
  .join('\n');

const exports = `export const onboarding = {
  ${jsonFiles
    .map((fileName, index) => {
      return `'${fileName}': json_${index}`;
    })
    .join(',\n')}
}`;

const template = `/* eslint-disable simple-import-sort/imports */
// Auto generated, do not edit manually
${imports}\n\n${exports}`;

fs.writeFileSync(path.resolve(__dirname, 'templates.gen.ts'), template);
