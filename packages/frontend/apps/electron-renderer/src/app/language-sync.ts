import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { I18nService } from '@affine/core/modules/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

export const DesktopLanguageSync = () => {
  const i18nService = useService(I18nService);
  const currentLanguage = useLiveData(i18nService.i18n.currentLanguageKey$);
  const handler = useService(DesktopApiService).api.handler;

  useEffect(() => {
    handler.i18n.changeLanguage(currentLanguage ?? 'en').catch(err => {
      console.error(err);
    });
  }, [currentLanguage, handler]);

  return null;
};
