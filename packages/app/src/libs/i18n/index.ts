import i18next, { Resource } from 'i18next';
import {
    I18nextProvider,
    initReactI18next,
    useTranslation,
} from 'react-i18next';
import { LOCALES } from './resources';
import type en_US from './resources/en.json';

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

const STORAGE_KEY = 'i18n_lng';

export { i18n, useTranslation, I18nProvider, LOCALES };

const resources = LOCALES.reduce<Resource>(
    (acc, { tag, res }) => ({ ...acc, [tag]: { translation: res } }),
    {}
);

const fallbackLng = LOCALES[0].tag;
const standardizeLocale = (language: string) => {
    if (LOCALES.find(locale => locale.tag === language)) return language;
    if (
        LOCALES.find(
            locale => locale.tag === language.slice(0, 2).toLowerCase()
        )
    )
        return language;
    return fallbackLng;
};

const language = standardizeLocale(
    localStorage.getItem(STORAGE_KEY) ?? navigator.language
);

const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng,
    debug: process.env['NODE_ENV'] === 'development',

    resources,
    interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
    },
});

i18n.on('languageChanged', lng => {
    localStorage.setItem(STORAGE_KEY, lng);
});

const I18nProvider = I18nextProvider;
