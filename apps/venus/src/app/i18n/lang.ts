import lang from 'i18next';
import { initReactI18next } from 'react-i18next';
import en_US from './en/en.json';
import zh_CN from './zh/zh.json';

const resources = {
    en: en_US,
    zh: zh_CN,
} as const;

lang.use(initReactI18next).init({
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
];

export default lang;
