// cSpell:ignore Tolgee
import { readFile } from 'fs/promises';
import path from 'path';

import { createsNewKey, getRemoteTranslations } from './api.js';
import type { TranslationRes } from './utils.js';

const BASE_JSON_PATH = path.resolve(
  process.cwd(),
  'src',
  'resources',
  'en.json'
);
const BASE_LANGUAGES = 'en' as const;

/**
 *
 * @example
 * ```ts
 * flatRes({ a: { b: 'c' } }); // { 'a.b': 'c' }
 * ```
 */
const flatRes = (obj: TranslationRes) => {
  const getEntries = (o: TranslationRes, prefix = ''): [string, string][] =>
    Object.entries(o).flatMap<[string, string]>(([k, v]) =>
      typeof v !== 'string'
        ? getEntries(v, `${prefix}${k}.`)
        : [[`${prefix}${k}`, v]]
    );
  return Object.fromEntries(getEntries(obj));
};

const differenceObject = (
  newObj: Record<string, string>,
  oldObj: Record<string, string>
) => {
  const add: string[] = [];
  const remove: string[] = [];
  const modify: string[] = [];
  const both: string[] = [];

  Object.keys(newObj).forEach(key => {
    if (!(key in oldObj)) {
      add.push(key);
    } else {
      both.push(key);
    }
  });

  Object.keys(oldObj).forEach(key => {
    if (!(key in newObj)) {
      remove.push(key);
    }
  });

  both.forEach(key => {
    if (!(key in newObj) || !(key in oldObj)) {
      throw new Error('Unreachable');
    }
    const newVal = newObj[key];
    const oldVal = oldObj[key];
    if (newVal !== oldVal) {
      modify.push(key);
    }
  });
  return { add, remove, modify };
};

function warnDiff(diff: { add: string[]; remove: string[]; modify: string[] }) {
  if (diff.add.length) {
    console.log('New keys found:', diff.add.join(', '));
    //See https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-a-notice-message
    process.env['CI'] &&
      console.log(
        `::notice file=${BASE_JSON_PATH},line=1,title=New keys::${diff.add.join(
          ', '
        )}`
      );
  }
  if (diff.remove.length) {
    console.warn('[WARN]', 'Unused keys found:', diff.remove.join(', '));
    process.env['CI'] &&
      console.warn(
        `::notice file=${BASE_JSON_PATH},line=1,title=Unused keys::${diff.remove.join(
          ', '
        )}`
      );
  }
  if (diff.modify.length) {
    console.warn('[WARN]', 'Inconsistent keys found:', diff.modify.join(', '));
    process.env['CI'] &&
      console.warn(
        `::warning file=${BASE_JSON_PATH},line=1,title=Inconsistent keys::${diff.modify.join(
          ', '
        )}`
      );
  }
}

const main = async () => {
  console.log('Loading local base translations...');
  const baseLocalTranslations = JSON.parse(
    await readFile(BASE_JSON_PATH, {
      encoding: 'utf8',
    })
  );
  const flatLocalTranslations = flatRes(baseLocalTranslations);
  console.log(
    `Loading local base translations success! Total ${
      Object.keys(flatLocalTranslations).length
    } keys`
  );

  console.log('Fetch remote base translations...');
  const baseRemoteTranslations = await getRemoteTranslations(BASE_LANGUAGES);
  const flatRemoteTranslations = flatRes(baseRemoteTranslations);
  console.log(
    `Fetch remote base translations success! Total ${
      Object.keys(flatRemoteTranslations).length
    } keys`
  );

  const diff = differenceObject(flatLocalTranslations, flatRemoteTranslations);

  console.log(''); // new line
  warnDiff(diff);
  console.log(''); // new line

  if (process.argv.slice(2).includes('--check')) {
    // check mode
    return;
  }

  diff.add.forEach(async key => {
    const val = flatLocalTranslations[key];
    console.log(`Creating new key: ${key} -> ${val}`);
    await createsNewKey(key, { [BASE_LANGUAGES]: val });
  });

  // TODO remove unused tags from used keys

  // diff.remove.forEach(key => {
  //   // TODO set unused tag
  //   // console.log(`Add ${DEPRECATED_TAG_NAME} to ${key}`);
  //   addTagByKey(key, DEPRECATED_TAG_NAME);
  // });

  // diff.modify.forEach(key => {
  //   // TODO warn different between local and remote base translations
  // });

  // TODO send notification
};

main();
