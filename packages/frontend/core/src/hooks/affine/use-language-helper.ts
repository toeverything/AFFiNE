import { LOCALES, useI18N } from '@affine/i18n';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useMemo } from 'react';

export function useLanguageHelper() {
  const i18n = useI18N();
  const currentLanguage = useMemo(
    () => LOCALES.find(item => item.tag === i18n.language),
    [i18n.language]
  );
  const languagesList = useMemo(
    () =>
      LOCALES.map(item => ({
        tag: item.tag,
        originalName: item.originalName,
        name: item.name,
      })),
    []
  );
  const onLanguageChange = useAsyncCallback(
    async (event: string) => {
      await i18n.changeLanguage(event);
    },
    [i18n]
  );

  return useMemo(
    () => ({
      currentLanguage,
      languagesList,
      onLanguageChange,
    }),
    [currentLanguage, languagesList, onLanguageChange]
  );
}
