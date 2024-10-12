import en from './en.json';

export type Language =
  | 'en'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'fr'
  | 'es'
  | 'es-AR'
  | 'es-CL'
  | 'de'
  | 'ru'
  | 'ja'
  | 'it'
  | 'ca'
  | 'da'
  | 'hi'
  | 'sv-SE'
  | 'ur'
  | 'ar'
  | 'ko'
  | 'pt-BR';

export type LanguageResource = typeof en;
export const SUPPORTED_LANGUAGES: Record<
  Language,
  {
    name: string;
    originalName: string;
    flagEmoji: string;
    resource:
      | LanguageResource
      | (() => Promise<{ default: Partial<LanguageResource> }>);
  }
> = {
  en: {
    name: 'English',
    originalName: 'English',
    flagEmoji: '🇬🇧',
    resource: en,
  },
  ko: {
    name: 'Korean (South Korea)',
    originalName: '한국어(대한민국)',
    flagEmoji: '🇰🇷',
    resource: () => /* webpackChunkName "i18n-ko" */ import('./ko.json'),
  },
  'pt-BR': {
    name: 'Portuguese (Brazil)',
    originalName: 'português (Brasil)',
    flagEmoji: '🇧🇷',
    resource: () => /* webpackChunkName "i18n-pt_BR" */ import('./pt-BR.json'),
  },
  'zh-Hans': {
    name: 'Simplified Chinese',
    originalName: '简体中文',
    flagEmoji: '🇨🇳',
    resource: () =>
      /* webpackChunkName "i18n-zh_Hans" */ import('./zh-Hans.json'),
  },
  'zh-Hant': {
    name: 'Traditional Chinese',
    originalName: '繁體中文',
    flagEmoji: '🇭🇰',
    resource: () =>
      /* webpackChunkName "i18n-zh_Hant" */ import('./zh-Hant.json'),
  },
  fr: {
    name: 'French',
    originalName: 'français',
    flagEmoji: '🇫🇷',
    resource: () => /* webpackChunkName "i18n-fr" */ import('./fr.json'),
  },
  es: {
    name: 'Spanish',
    originalName: 'español',
    flagEmoji: '🇪🇸',
    resource: () => /* webpackChunkName "i18n-es" */ import('./es.json'),
  },
  'es-AR': {
    name: 'Spanish (Argentina)',
    originalName: 'español (Argentina)',
    flagEmoji: '🇦🇷',
    resource: () => /* webpackChunkName "i18n-es_AR" */ import('./es-AR.json'),
  },
  'es-CL': {
    name: 'Spanish (Chile)',
    originalName: 'español (Chile)',
    flagEmoji: '🇨🇱',
    resource: () => /* webpackChunkName "i18n-es_CL" */ import('./es-CL.json'),
  },
  de: {
    name: 'German',
    originalName: 'Deutsch',
    flagEmoji: '🇩🇪',
    resource: () => /* webpackChunkName "i18n-de" */ import('./de.json'),
  },
  ru: {
    name: 'Russian',
    originalName: 'русский',
    flagEmoji: '🇷🇺',
    resource: () => /* webpackChunkName "i18n-ru" */ import('./ru.json'),
  },
  ja: {
    name: 'Japanese',
    originalName: '日本語',
    flagEmoji: '🇯🇵',
    resource: () => /* webpackChunkName "i18n-ja" */ import('./ja.json'),
  },
  it: {
    name: 'Italian',
    originalName: 'italiano',
    flagEmoji: '🇮🇹',
    resource: () => /* webpackChunkName "i18n-it" */ import('./it.json'),
  },
  ca: {
    name: 'Catalan',
    originalName: 'català',
    flagEmoji: '🇦🇩',
    resource: () => /* webpackChunkName "i18n-ca" */ import('./ca.json'),
  },
  da: {
    name: 'Danish',
    originalName: 'dansk',
    flagEmoji: '🇩🇰',
    resource: () => /* webpackChunkName "i18n-da" */ import('./da.json'),
  },
  hi: {
    name: 'Hindi',
    originalName: 'हिन्दी',
    flagEmoji: '🇮🇳',
    resource: () => /* webpackChunkName "i18n-hi" */ import('./hi.json'),
  },
  'sv-SE': {
    name: 'Swedish (Sweden)',
    originalName: 'svenska (Sverige)',
    flagEmoji: '🇸🇪',
    resource: () => /* webpackChunkName "i18n-sv_SE" */ import('./sv-SE.json'),
  },

  ur: {
    name: 'Urdu',
    originalName: 'اردو',
    flagEmoji: '🇵🇰',
    resource: () => /* webpackChunkName "i18n-ur" */ import('./ur.json'),
  },
  ar: {
    name: 'Arabic',
    originalName: 'العربية',
    flagEmoji: '🇸🇦',
    resource: () => /* webpackChunkName "i18n-ar" */ import('./ar.json'),
  },
};
