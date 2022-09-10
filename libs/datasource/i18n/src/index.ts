import i18next, { Resource } from 'i18next';
import {
    I18nextProvider,
    initReactI18next,
    useTranslation,
} from 'react-i18next';
import en_US from './resources/en.json';
import zh_CN from './resources/zh.json';

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

const LOCALES = [
    { value: 'en', text: 'English', res: en_US },
    { value: 'zh', text: '简体中文', res: zh_CN },
] as const;

const resources = LOCALES.reduce<Resource>(
    (acc, { value, res }) => ({ ...acc, [value]: { translation: res } }),
    {}
);

const fallbackLng = LOCALES[0].value;
const standardizeLocale = (language: string) => {
    if (LOCALES.find(locale => locale.value === language)) return language;
    if (
        LOCALES.find(
            locale => locale.value === language.slice(0, 2).toLowerCase()
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

export { i18n, useTranslation, I18nProvider, LOCALES };
