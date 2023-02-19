import i18next, { Resource } from 'i18next';
import { initReactI18next, Trans, useTranslation } from 'react-i18next';

import { LOCALES } from './resources';
import type en_US from './resources/en.json';

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

export { i18n, LOCALES, Trans, useTranslation };

const resources = LOCALES.reduce<Resource>(
  (acc, { tag, res }) => ({ ...acc, [tag]: { translation: res } }),
  {}
);

const fallbackLng = 'en';
const standardizeLocale = (language: string) => {
  if (language === 'zh-CN' || language === 'zh' || language === 'zh-Hans') {
    language = 'zh-Hans';
  } else if (language.slice(0, 2).toLowerCase() === 'zh') {
    language = 'zh-Hant';
  }
  if (LOCALES.find(locale => locale.tag === language)) return language;
  if (
    LOCALES.find(locale => locale.tag === language.slice(0, 2).toLowerCase())
  ) {
    return language.slice(0, 2).toLowerCase();
  }

  return fallbackLng;
};
let language = 'en';

if (typeof window !== 'undefined') {
  const localStorageLanguage = localStorage.getItem(STORAGE_KEY);
  if (localStorageLanguage) {
    language = standardizeLocale(localStorageLanguage);
  } else {
    language = standardizeLocale(navigator.language);
  }
}
const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  lng: language,
  fallbackLng,
  debug: false,
  resources,
  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
  },
});

i18n.on('languageChanged', lng => {
  localStorage.setItem(STORAGE_KEY, lng);
});

// const I18nProvider = I18nextProvider;
