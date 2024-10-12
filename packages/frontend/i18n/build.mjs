import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '@magic-works/i18n-codegen';

const isDev = process.argv.includes('--dev');

const pkgRoot = fileURLToPath(new URL('./', import.meta.url));

function calcCompletenesses() {
  const resourcesDir = join(pkgRoot, 'src', 'resources');

  const langs = readdirSync(resourcesDir)
    .filter(file => file.endsWith('.json'))
    .reduce((langs, file) => {
      const filePath = `${resourcesDir}/${file}`;
      const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
      langs[parse(file).name] = fileContent;
      return langs;
    }, {});

  const base = Object.keys(langs.en).length;

  const completenesses = {};

  for (const key in langs) {
    const [langPart, variantPart] = key.split('-');

    const completeness = Object.keys(
      variantPart ? { ...langs[langPart], ...langs[key] } : langs[key]
    ).length;

    completenesses[key] = Math.min(
      Math.ceil(/* avoid 0% */ (completeness / base) * 100),
      100
    );
  }

  writeFileSync(
    join(pkgRoot, 'src', 'i18n-completenesses.json'),
    JSON.stringify(completenesses, null, 2)
  );
}

runCli(
  {
    config: fileURLToPath(new URL('./.i18n-codegen.json', import.meta.url)),
    watch: isDev,
  },
  error => {
    console.error(error);
    if (!isDev) {
      process.exit(1);
    }
  }
);

calcCompletenesses();
