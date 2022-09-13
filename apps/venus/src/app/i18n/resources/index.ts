import en from './en.json';
import es from './es.json';
import zh_Hans from './zh.json';

export const LOCALES = [
    {
        name: 'English',
        tag: 'en',
        originalName: 'English',
        res: en,
    },
    {
        name: 'Simplified Chinese',
        tag: 'zh-Hans',
        originalName: '简体中文',
        res: zh_Hans,
    },
    {
        name: 'Spanish',
        tag: 'es',
        originalName: 'español',
        res: es,
    },
] as const;
