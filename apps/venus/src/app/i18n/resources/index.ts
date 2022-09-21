import de from './de.json';
import en from './en.json';
import es from './es.json';
import sr from './sr.json';
import zh_Hant from './zh-Hant.json';
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
        name: 'Traditional Chinese',
        tag: 'zh-Hant',
        originalName: '繁體中文',
        res: zh_Hant,
    },
    {
        name: 'Spanish',
        tag: 'es',
        originalName: 'español',
        res: es,
    },
    {
        name: 'Serbian',
        tag: 'sr',
        originalName: 'српски',
        res: sr,
    },
    {
        name: 'German',
        tag: 'de',
        originalName: 'Deutsch',
        res: de,
    },
] as const;
