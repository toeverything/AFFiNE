import { getI18n } from 'react-i18next';

import type { useAFFiNEI18N } from './i18n-generated';

export type I18nFuncs = ReturnType<typeof useAFFiNEI18N>;

export type I18nInfos = {
  [K in keyof I18nFuncs]: I18nFuncs[K] extends (...a: infer Opt) => any
    ? Opt[0]
    : never;
};

export type I18nKeys = keyof I18nInfos;

export type I18nString =
  | {
      [K in I18nKeys]: {
        key: K;
      } & (I18nInfos[K] extends undefined
        ? unknown
        : { options: I18nInfos[K] });
    }[I18nKeys]
  | string;

const I18nMethod = {
  t(i18nStr: I18nString) {
    const i18n = getI18n();
    if (typeof i18nStr === 'object') {
      return i18n.t(i18nStr.key, 'options' in i18nStr ? i18nStr.options : {});
    }
    return i18nStr;
  },
  get language() {
    const i18n = getI18n();
    return i18n.language;
  },
};

const I18nProxy = new Proxy(I18nMethod, {
  get(self, key) {
    const i18n = getI18n();
    if (typeof key === 'string' && i18n.exists(key)) {
      return i18n.t.bind(i18n, key as string);
    } else {
      return (self as any)[key as string] as any;
    }
  },
});

/**
 * I18n['com.affine.xxx']({ arg1: 'hello' }) -> '中文 hello'
 */
export const I18n = I18nProxy as I18nFuncs & typeof I18nMethod;
export type I18n = typeof I18n;
