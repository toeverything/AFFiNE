import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { createI18nWrapper } from './i18next';

export const useI18n = () => {
  const { i18n } = useTranslation('translation');

  return useMemo(() => createI18nWrapper(() => i18n), [i18n]);
};

export { I18nextProvider, Trans } from 'react-i18next';
