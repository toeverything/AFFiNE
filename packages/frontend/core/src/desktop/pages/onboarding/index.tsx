import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { useServiceOptional } from '@toeverything/infra';
import { useCallback } from 'react';

import { Onboarding } from '../../../components/affine/onboarding/onboarding';

export const Component = () => {
  const desktopApi = useServiceOptional(DesktopApiService);

  const openApp = useCallback(() => {
    desktopApi?.handler.ui.handleOpenMainApp().catch(err => {
      console.log('failed to open main app', err);
    });
  }, [desktopApi]);

  return <Onboarding onOpenApp={openApp} />;
};
