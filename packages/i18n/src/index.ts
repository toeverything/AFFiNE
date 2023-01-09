import i18next, { Resource } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { LOCALES } from './resources/index.js';
import type en_US from './resources/en.json';

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
    resources: {
      en: typeof en_US;
    };
  }
}

// const STORAGE_KEY = 'i18n_lng';

export { i18n, useTranslation, LOCALES };

const resources = LOCALES.reduce<Resource>(
  (acc, { tag, res }) => ({ ...acc, [tag]: { translation: res } }),
  {}
);

const fallbackLng = LOCALES[0].tag;
const standardizeLocale = (language: string) => {
  if (LOCALES.find(locale => locale.tag === language)) return language;
  if (LOCALES.find(locale => locale.tag === language.slice(0, 2).toLowerCase()))
    return language;
  return fallbackLng;
};

const language = standardizeLocale(
  //   localStorage.getItem(STORAGE_KEY) ??
  //     (typeof navigator !== 'undefined' ? navigator.language : 'en')
  'en'
);

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

i18n.on('languageChanged', () => {
  //   localStorage.setItem(STORAGE_KEY, lng);
});

// const I18nProvider = I18nextProvider;
