import { readFileSync } from 'node:fs';

import { once } from 'lodash-es';
import { format, type FormatConfig } from 'oxfmt';

import { ProjectRoot } from './path';

const readConfig = once(() => {
  const path = ProjectRoot.join('.oxfmtrc.json').value;
  const config = JSON.parse(readFileSync(path, 'utf-8')) as FormatConfig;
  return config;
});

export async function formatCode(content: string, fileName: string) {
  const result = await format(fileName, content, readConfig());
  if (result.errors.length) {
    throw new Error(
      result.errors.map(error => error.codeframe ?? error.message).join('\n')
    );
  }
  return result.code;
}
