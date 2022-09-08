// cSpell:ignore Tolgee
import { readFile } from 'fs/promises';
import path from 'path';
import { addTagByKey, createsNewKey, getLanguagesTranslations } from './api';

const BASE_JSON_PATH = path.resolve(process.cwd(), 'src', 'base.json');
const BASE_LANGUAGES = 'en' as const;

const DEPRECATED_TAG_NAME = 'unused' as const;

interface TranslationRes {
    [x: string]: string | TranslationRes;
}

const getRemoteTranslations = async (languages: string) => {
    const translations = await getLanguagesTranslations(languages);
    if (!(languages in translations)) {
        console.log(translations);
        throw new Error(
            'Failed to get base languages translation! base languages: ' +
                languages
        );
    }
    // The assert is safe because we checked above
    return translations[languages]!;
};

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

    const diff = differenceObject(
        flatLocalTranslations,
        flatRemoteTranslations
    );

    console.log(''); // new line
    diff.add.length && console.log('New keys found:', diff.add.join(', '));
    diff.remove.length &&
        console.warn('[WARN]', 'Unused keys found:', diff.remove.join(', '));
    diff.modify.length &&
        console.warn(
            '[WARN]',
            'Inconsistent keys found:',
            diff.modify.join(', ')
        );
    console.log(''); // new line

    diff.add.forEach(async key => {
        const val = flatLocalTranslations[key];
        console.log(`Creating new key: ${key} -> ${val}`);
        await createsNewKey(key, { [BASE_LANGUAGES]: val });
    });

    // TODO remove unused tags from used keys

    diff.remove.forEach(key => {
        // TODO set unused tag
        // console.log(`Add ${DEPRECATED_TAG_NAME} to ${key}`);
        addTagByKey(key, DEPRECATED_TAG_NAME);
    });

    diff.modify.forEach(key => {
        // TODO warn different between local and remote base translations
    });

    // TODO send notification
};

main();
