import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en_US from './resources/en.json';
import zh_CN from './resources/zh.json';

// See https://react.i18next.com/latest/typescript
declare module 'react-i18next' {
    // and extend them!
    interface CustomTypeOptions {
        // custom namespace type if you changed it
        defaultNS: 'ns1';
        // custom resources type
        resources: {
            en: typeof en_US.translation;
            zh: typeof zh_CN.translation;
        };
    }
}

const resources = {
    en: en_US,
    zh: zh_CN,
} as const;

i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',

    resources,
    interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
    },
});

export const options = [
    { value: 'en', text: 'English' },
    { value: 'zh', text: '简体中文' },
] as const;

export { i18next };
