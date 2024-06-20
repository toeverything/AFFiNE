import { useMemo } from 'react';
import { getI18n, useTranslation } from 'react-i18next';

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

export const isI18nString = (value: any): value is I18nString => {
  return (
    typeof value === 'string' || (typeof value === 'object' && 'key' in value)
  );
};

function createI18nWrapper(
  getI18nFn: () => ReturnType<typeof getI18n>,
  getI18nT: () => ReturnType<typeof getI18n>['t']
) {
  const I18nMethod = {
    t(i18nStr: I18nString) {
      const i18n = getI18nFn();
      if (typeof i18nStr === 'object') {
        return i18n.t(i18nStr.key, 'options' in i18nStr ? i18nStr.options : {});
      }
      return i18nStr;
    },
    get language() {
      const i18n = getI18nFn();
      return i18n.language;
    },
    changeLanguage(lng?: string | undefined) {
      const i18n = getI18nFn();
      return i18n.changeLanguage(lng);
    },
    get on() {
      const i18n = getI18nFn();
      return i18n.on.bind(i18n);
    },
  };

  return new Proxy(I18nMethod, {
    get(self, key) {
      const i18n = getI18nFn();
      if (typeof key === 'string' && i18n.exists(key)) {
        return getI18nT().bind(null, key as string);
      } else {
        return (self as any)[key as string] as any;
      }
    },
  }) as I18nFuncs & typeof I18nMethod;
}

export const useI18n = () => {
  const { i18n, t } = useTranslation();
  return useMemo(
    () =>
      createI18nWrapper(
        () => i18n,
        () => t
      ),
    [i18n, t]
  );
};

/**
 * I18n['com.affine.xxx']({ arg1: 'hello' }) -> '中文 hello'
 */
export const I18n = createI18nWrapper(getI18n, () => getI18n().t);
export type I18n = typeof I18n;
