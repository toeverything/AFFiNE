import ar from './ar.json';
import ca from './ca.json';
import da from './da.json';
import de from './de.json';
import en from './en.json';
import es from './es.json';
import es_AR from './es-AR.json';
import es_CL from './es-CL.json';
import fr from './fr.json';
import hi from './hi.json';
import it from './it.json';
import ja from './ja.json';
import ko from './ko.json';
import pt_BR from './pt-BR.json';
import ru from './ru.json';
import sv_SE from './sv-SE.json';
import ur from './ur.json';
import zh_Hans from './zh-Hans.json';
import zh_Hant from './zh-Hant.json';

export const LOCALES = [
  {
    name: 'Korean (South Korea)',
    tag: 'ko',
    originalName: '한국어(대한민국)',
    flagEmoji: '🇰🇷',
    base: false,
    res: ko,
  },
  {
    name: 'Portuguese (Brazil)',
    tag: 'pt-BR',
    originalName: 'português (Brasil)',
    flagEmoji: '🇧🇷',
    base: false,
    res: pt_BR,
  },
  {
    name: 'English',
    tag: 'en',
    originalName: 'English',
    flagEmoji: '🇬🇧',
    base: true,
    res: en,
  },
  {
    name: 'Traditional Chinese',
    tag: 'zh-Hant',
    originalName: '繁體中文',
    flagEmoji: '🇭🇰',
    base: false,
    res: zh_Hant,
  },
  {
    name: 'Simplified Chinese',
    tag: 'zh-Hans',
    originalName: '简体中文',
    flagEmoji: '🇨🇳',
    base: false,
    res: zh_Hans,
  },
  {
    name: 'French',
    tag: 'fr',
    originalName: 'français',
    flagEmoji: '🇫🇷',
    base: false,
    res: fr,
  },
  {
    name: 'Spanish',
    tag: 'es',
    originalName: 'español',
    flagEmoji: '🇪🇸',
    base: false,
    res: es,
  },
  {
    name: 'German',
    tag: 'de',
    originalName: 'Deutsch',
    flagEmoji: '🇩🇪',
    base: false,
    res: de,
  },
  {
    name: 'Russian',
    tag: 'ru',
    originalName: 'русский',
    flagEmoji: '🇷🇺',
    base: false,
    res: ru,
  },
  {
    name: 'Japanese',
    tag: 'ja',
    originalName: '日本語',
    flagEmoji: '🇯🇵',
    base: false,
    res: ja,
  },
  {
    name: 'Italian',
    tag: 'it',
    originalName: 'italiano',
    flagEmoji: '🇮🇹',
    base: false,
    res: it,
  },
  {
    name: 'Catalan',
    tag: 'ca',
    originalName: 'català',
    flagEmoji: '🇦🇩',
    base: false,
    res: ca,
  },
  {
    name: 'Danish',
    tag: 'da',
    originalName: 'dansk',
    flagEmoji: '🇩🇰',
    base: false,
    res: da,
  },
  {
    name: 'Spanish (Chile)',
    tag: 'es-CL',
    originalName: 'español (Chile)',
    flagEmoji: '🇨🇱',
    base: false,
    res: es_CL,
  },
  {
    name: 'Hindi',
    tag: 'hi',
    originalName: 'हिन्दी',
    flagEmoji: '🇮🇳',
    base: false,
    res: hi,
  },
  {
    name: 'Swedish (Sweden)',
    tag: 'sv-SE',
    originalName: 'svenska (Sverige)',
    flagEmoji: '🇸🇪',
    base: false,
    res: sv_SE,
  },
  {
    name: 'Spanish (Argentina)',
    tag: 'es-AR',
    originalName: 'español (Argentina)',
    flagEmoji: '🇦🇷',
    base: false,
    res: es_AR,
  },
  {
    name: 'Urdu',
    tag: 'ur',
    originalName: 'اردو',
    flagEmoji: '🇵🇰',
    base: false,
    res: ur,
  },
  {
    name: 'Arabic',
    tag: 'ar',
    originalName: 'العربية',
    flagEmoji: '🇸🇦',
    base: false,
    res: ar,
  },
] as const;
