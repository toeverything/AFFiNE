import { I18nextProvider } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { type PropsWithChildren, useEffect } from 'react';

import { I18nService } from './services/i18n';

export function I18nProvider({ children }: PropsWithChildren) {
  const i18n = useService(I18nService).i18n;

  useEffect(() => {
    i18n.init();
  }, [i18n]);

  return <I18nextProvider i18n={i18n.i18next}>{children}</I18nextProvider>;
}
