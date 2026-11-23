import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProjectRoot } from '@affine-tools/utils/path';
import { Package } from '@affine-tools/utils/workspace';
import { runCli } from '@magic-works/i18n-codegen';
import { glob } from 'glob';

const isDev = process.argv.includes('--dev');
const shouldCleanup = process.argv.includes('--cleanup');

const i18nPkg = new Package('@affine/i18n');
const resourcesDir = i18nPkg.join('src', 'resources').toString();

function readResource(lang: string): Record<string, string> {
  const filePath = `${resourcesDir}/${lang}.json`;
  const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
  return fileContent;
}

function writeResource(lang: string, resource: Record<string, string>) {
  const filePath = `${resourcesDir}/${lang}.json`;
  writeFileSync(filePath, JSON.stringify(resource, null, 2) + '\n');
}

async function cleanupResources() {
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const files = await glob('packages/frontend/**/src/**/*.{js,tsx,ts}', {
    ignore: [
      '**/node_modules/**',
      '**/packages/frontend/i18n/src/resources/*',
      '**/packages/frontend/i18n/src/i18n.gen.ts',
      '**/dist/**',
      '**/lib/**',
    ],
    cwd: ProjectRoot.toString(),
    absolute: true,
  });

  const filesWithContent = files.map(file => {
    return {
      path: file,
      content: readFileSync(file, 'utf8'),
    };
  });

  const dynamicPrefixes = new Set<string>();
  const templatePrefixRegex = /`[^`]*?(com\.affine\.[^`]*?)\$\{/g;
  const concatPrefixRegex = /['"](com\.affine\.[^'"]*?\.)['"]\s*\+/g;
  const addDynamicPrefix = (rawPrefix: string) => {
    let prefix = rawPrefix;
    if (!prefix.endsWith('.')) {
      const lastDot = prefix.lastIndexOf('.');
      if (lastDot === -1) {
        return;
      }
      prefix = prefix.slice(0, lastDot + 1);
    }
    dynamicPrefixes.add(prefix);
  };

  for (const file of filesWithContent) {
    templatePrefixRegex.lastIndex = 0;
    concatPrefixRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = templatePrefixRegex.exec(file.content)) !== null) {
      addDynamicPrefix(match[1]);
    }
    while ((match = concatPrefixRegex.exec(file.content)) !== null) {
      addDynamicPrefix(match[1]);
    }
  }

  const resources = readdirSync(resourcesDir)
    .filter(file => file.endsWith('.json'))
    .reduce(
      (langs, file) => {
        const lang = parse(file).name;
        langs[lang] = readResource(lang);
        return langs;
      },
      {} as Record<string, Record<string, string>>
    );

  const candidateKeys = new Set<string>();

  for (const resource of Object.values(resources)) {
    Object.keys(resource).forEach(key => {
      if (!key.startsWith('com.affine.payment.modal.')) {
        candidateKeys.add(key);
      }
    });
  }

  const unusedKeys = Array.from(candidateKeys).filter(key => {
    const regex1 = new RegExp(`[\`'"]${escapeRegExp(key)}[\`'"]`, 'g');
    const lastDot = key.lastIndexOf('.');
    const keyPrefix = lastDot === -1 ? '' : key.slice(0, lastDot + 1);
    if (keyPrefix && dynamicPrefixes.has(keyPrefix)) {
      return false;
    }
    for (const file of filesWithContent) {
      const match = file.content.match(regex1);
      if (match) {
        return false;
      }
    }
    return true;
  });

  if (unusedKeys.length === 0) {
    return;
  }

  const unusedKeySet = new Set(unusedKeys);

  for (const [lang, resource] of Object.entries(resources)) {
    let changed = false;
    for (const key of Object.keys(resource)) {
      if (unusedKeySet.has(key)) {
        delete resource[key];
        changed = true;
      }
    }
    if (changed) {
      writeResource(lang, resource);
    }
  }
}

function calcCompletenesses() {
  const langs = readdirSync(resourcesDir)
    .filter(file => file.endsWith('.json'))
    .reduce(
      (langs, file) => {
        const lang = parse(file).name;
        langs[lang] = readResource(lang);
        return langs;
      },
      {} as Record<string, Record<string, string>>
    );

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
    i18nPkg.join('src', 'i18n-completenesses.json').toString(),
    JSON.stringify(completenesses, null, 2) + '\n'
  );
}

function i18nnext() {
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
}

async function appendErrorI18n() {
  const server = new Package('@affine/server');
  const defFilePath = server.srcPath.join('base/error/def.ts');

  if (!defFilePath.exists()) {
    throw new Error(
      `Can not find Server I18n error definition file. It's not placed at [${defFilePath.relativePath}].`
    );
  }

  const { USER_FRIENDLY_ERRORS } = await import(
    defFilePath.toFileUrl().toString()
  );

  if (!USER_FRIENDLY_ERRORS) {
    throw new Error(
      `Can not find Server I18n error definition file. It's not placed at [${defFilePath.relativePath}] with name [USER_FRIENDLY_ERRORS].`
    );
  }

  const en = readResource('en');

  Object.keys(en).forEach(key => {
    if (key.startsWith('error.')) {
      delete en[key];
    }
  });

  for (const key in USER_FRIENDLY_ERRORS) {
    const def = USER_FRIENDLY_ERRORS[key] as {
      type: string;
      args?: Record<string, any>;
      message: string | ((args: any) => string);
    };

    en[`error.${key.toUpperCase()}`] =
      typeof def.message === 'string'
        ? def.message
        : def.message(
            Object.keys(def.args ?? {}).reduce(
              (args, key) => {
                args[key] = `{{${key}}}`;
                return args;
              },
              {} as Record<string, string>
            )
          );
  }

  writeResource('en', en);
}

await appendErrorI18n();
if (shouldCleanup) {
  await cleanupResources();
}
i18nnext();
calcCompletenesses();
