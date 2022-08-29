import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en_US from './resources/en.json';
import zh_CN from './resources/zh.json';

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
];

export { i18next };

// import { useTranslation } from 'react-i18next';
// import { options } from './i18n';
// <Select defaultValue="en" onChange={changeLanguage}>
// {options.map(option => (
//     <Option key={option.value} value={option.value}>
//         {option.text}
//     </Option>
// ))}
// </Select>

// const { t, i18n } = useTranslation();
// const changeLanguage = (event: any) => {
//     i18n.changeLanguage(event);
// };
