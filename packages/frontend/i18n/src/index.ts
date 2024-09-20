import type { i18n, Resource } from 'i18next';
import i18next from 'i18next';
import type { I18nextProviderProps } from 'react-i18next';
import { I18nextProvider, initReactI18next, Trans } from 'react-i18next';

import { LOCALES } from './resources';
import type en_US from './resources/en.json';

export * from './i18n';
export * from './utils';

declare module 'i18next' {
  // Refs: https://www.i18next.com/overview/typescript#argument-of-type-defaulttfuncreturn-is-not-assignable-to-parameter-of-type-xyz
  interface CustomTypeOptions {
    returnNull: false;
  }
}

// const localStorage = {
//   getItem() {
//     return undefined;
//   },
//   setItem() {},
// };
// See https://react.i18next.com/latest/typescript
declare module 'react-i18next' {
  interface CustomTypeOptions {
    // custom namespace type if you changed it
    // defaultNS: 'ns1';
    // custom resources type
    allowObjectInHTMLChildren: true;
    resources: {
      en: typeof en_US;
    };
  }
}

const STORAGE_KEY = 'i18n_lng';

export { I18nextProvider, LOCALES, Trans };

const resources = LOCALES.reduce<Resource>((acc, { tag, res }) => {
  return Object.assign(acc, { [tag]: { translation: res } });
}, {});

const fallbackLng = 'en';
const standardizeLocale = (language: string) => {
  if (language === 'zh-CN' || language === 'zh' || language === 'zh-Hans') {
    language = 'zh-Hans';
  } else if (language.slice(0, 2).toLowerCase() === 'zh') {
    language = 'zh-Hant';
  }
  if (LOCALES.some(locale => locale.tag === language)) return language;
  if (
    LOCALES.some(locale => locale.tag === language.slice(0, 2).toLowerCase())
  ) {
    return language.slice(0, 2).toLowerCase();
  }

  return fallbackLng;
};

export const createI18n = (): I18nextProviderProps['i18n'] => {
  const i18n: I18nextProviderProps['i18n'] = i18next.createInstance();
  i18n
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng,
      debug: false,
      resources,
      interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
      },
    })
    .then(() => {
      console.info('i18n init success');
    })
    .catch(() => {
      console.error('i18n init failed');
    });

  if (globalThis.localStorage) {
    i18n.on('languageChanged', lng => {
      localStorage.setItem(STORAGE_KEY, lng);
    });
  }
  return i18n;
};

export function setUpLanguage(i: i18n) {
  let language;
  const localStorageLanguage = localStorage.getItem(STORAGE_KEY);
  if (localStorageLanguage) {
    language = standardizeLocale(localStorageLanguage);
  } else {
    language = standardizeLocale(navigator.language);
  }
  return i.changeLanguage(language);
}

const cachedCompleteness: Record<string, number> = {};
export const calcLocaleCompleteness = (
  locale: (typeof LOCALES)[number]['tag']
) => {
  if (cachedCompleteness[locale]) {
    return cachedCompleteness[locale];
  }
  const base = LOCALES.find(item => item.base);
  if (!base) {
    throw new Error('Base language not found');
  }
  const target = LOCALES.find(item => item.tag === locale);
  if (!target) {
    throw new Error('Locale not found');
  }
  const baseKeyCount = Object.keys(base.res).length;
  const translatedKeyCount = Object.keys(target.res).length;
  const completeness = translatedKeyCount / baseKeyCount;
  cachedCompleteness[target.tag] = completeness;
  return completeness;
};
