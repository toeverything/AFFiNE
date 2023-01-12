// cSpell:ignore Tolgee
import { fetchTolgee } from './request.js';

/**
 * Returns all project languages
 *
 * See https://tolgee.io/api#operation/getAll_6
 * @example
 * ```ts
 * const languages = [
 *   {
 *     id: 1000016008,
 *     name: 'English',
 *     tag: 'en',
 *     originalName: 'English',
 *     flagEmoji: '🇬🇧',
 *     base: true
 *   },
 *   {
 *     id: 1000016013,
 *     name: 'Spanish',
 *     tag: 'es',
 *     originalName: 'español',
 *     flagEmoji: '🇪🇸',
 *     base: false
 *   },
 *   {
 *     id: 1000016009,
 *     name: 'Simplified Chinese',
 *     tag: 'zh-Hans',
 *     originalName: '简体中文',
 *     flagEmoji: '🇨🇳',
 *     base: false
 *   },
 *   {
 *     id: 1000016012,
 *     name: 'Traditional Chinese',
 *     tag: 'zh-Hant',
 *     originalName: '繁體中文',
 *     flagEmoji: '🇭🇰',
 *     base: false
 *   }
 * ]
 * ```
 */

export const getAllProjectLanguages = async (
  size = 1000
): Promise<
  {
    id: number;
    name: string;
    tag: string;
    originalName: string;
    flagEmoji: string;
    base: boolean;
  }[]
> => {
  const url = `/languages?size=${size}`;
  const resp = await fetchTolgee(url);
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
  }
  const json: {
    _embedded: {
      languages: {
        id: number;
        name: string;
        tag: string;
        originalName: string;
        flagEmoji: string;
        base: boolean;
      }[];
    };
    page: unknown;
  } = await resp.json();
  return json._embedded.languages;
};

/**
 * Returns translations in project
 *
 * See https://tolgee.io/api#operation/getTranslations_
 */
export const getTranslations = async (): Promise<unknown> => {
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
): Promise<{ [key in T]?: Record<string, string> }> => {
  const url = `/translations/${languages}`;
  const resp = await fetchTolgee(url);
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
  }
  const json = await resp.json();
  return json;
};

export const getRemoteTranslations = async (
  languages: string
): Promise<Record<string, string>> => {
  const translations = await getLanguagesTranslations(languages);
  if (!(languages in translations)) {
    return {};
  }
  // The assert is safe because we checked above
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return translations[languages]!;
};

/**
 * Creates new key
 *
 * See https://tolgee.io/api#operation/create_2
 */
export const createsNewKey = async (
  key: string,
  translations: Record<string, string>
): Promise<unknown> => {
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
export const addTag = async (
  keyId: string,
  tagName: string
): Promise<unknown> => {
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
export const removeTag = async (
  keyId: string,
  tagId: number
): Promise<unknown> => {
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

// export const addTagByKey = async (key: string, tag: string) => {
//   // TODO get key id by key name
//   // const keyId =
//   // addTag(keyId, tag);
// };

/**
 * Exports data
 *
 * See https://tolgee.io/api#operation/export_1
 */
export const exportResources = async (): Promise<Response> => {
  const url = `/export`;
  const resp = await fetchTolgee(url);

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(url + ' ' + resp.status + '\n' + (await resp.text()));
  }
  return resp;
};
