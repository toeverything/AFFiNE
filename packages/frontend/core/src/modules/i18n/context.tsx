import { I18nextProvider, SUPPORTED_LANGUAGES } from '@affine/i18n';
import { DirectionProvider } from '@radix-ui/react-direction';
import { useLiveData, useService } from '@toeverything/infra';
import { type PropsWithChildren, useEffect, useMemo } from 'react';

import { I18nService } from './services/i18n';

export function I18nProvider({ children }: PropsWithChildren) {
  const i18n = useService(I18nService).i18n;

  useEffect(() => {
    i18n.init();
  }, [i18n]);

  const languageKey = useLiveData(i18n.currentLanguageKey$);
  const dir = useMemo(
    () =>
      languageKey && SUPPORTED_LANGUAGES[languageKey]?.rtl ? 'rtl' : 'ltr',
    [languageKey]
  );

  return (
    <I18nextProvider i18n={i18n.i18next}>
      <DirectionProvider dir={dir}>{children}</DirectionProvider>
    </I18nextProvider>
  );
}
