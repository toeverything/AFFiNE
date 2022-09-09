// cSpell:ignore Tolgee
import { fetchTolgee } from './request';

/**
 * Returns all project languages
 *
 * See https://tolgee.io/api#operation/getAll_6
 */
export const getAllProjectLanguages = async () => {
    const url = '/languages?size=1000';
    const resp = await fetchTolgee(url);
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
    }
    const json = await resp.json();
    return json;
};

/**
 * Returns translations in project
 *
 * See https://tolgee.io/api#operation/getTranslations_
 */
export const getTranslations = async () => {
    const url = '/translations';
    const resp = await fetchTolgee(url);
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
    }
    const json = await resp.json();
    return json;
};

/**
 * Returns all translations for specified languages
 *
 * See https://tolgee.io/api#operation/getAllTranslations_1
 */
export const getLanguagesTranslations = async <T extends string>(
    languages: T
) => {
    const url = `/translations/${languages}`;
    const resp = await fetchTolgee(url);
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
    }
    const json: { [key in T]?: Record<string, string> } = await resp.json();
    return json;
};

/**
 * Creates new key
 *
 * See https://tolgee.io/api#operation/create_2
 */
export const createsNewKey = async (
    key: string,
    translations: Record<string, string>
) => {
    const url = '/translations/keys/create';
    const resp = await fetchTolgee(url, {
        method: 'POST',
        body: JSON.stringify({ name: key, translations }),
    });
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
    }
    const json = await resp.json();
    return json;
};

/**
 * Tags a key with tag. If tag with provided name doesn't exist, it is created
 *
 * See https://tolgee.io/api#operation/tagKey_1
 */
export const addTag = async (keyId: string, tagName: string) => {
    const url = `/keys/${keyId}/tags`;
    const resp = await fetchTolgee(url, {
        method: 'PUT',
        body: JSON.stringify({ name: tagName }),
    });
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
    }
    const json = await resp.json();
    return json;
};

/**
 * Tags a key with tag. If tag with provided name doesn't exist, it is created
 *
 * See https://tolgee.io/api#operation/tagKey_1
 */
export const removeTag = async (keyId: string, tagId: number) => {
    const url = `/keys/${keyId}/tags/${tagId}`;
    const resp = await fetchTolgee(url, {
        method: 'DELETE',
    });
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
    }
    const json = await resp.json();
    return json;
};

export const addTagByKey = async (key: string, tag: string) => {
    // TODO get key id by key name
    // const keyId =
    // addTag(keyId, tag);
};
