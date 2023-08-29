import { AuthPageContainer } from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

let lastOpened = '';

export const Component = () => {
  const t = useAFFiNEI18N();
  const [params] = useSearchParams();
  const urlToOpen = useMemo(() => params.get('url'), [params]);
  useEffect(() => {
    if (!urlToOpen || lastOpened === urlToOpen) {
      return;
    }
    lastOpened = urlToOpen;
    open(urlToOpen, '_blank');
  }, [urlToOpen]);

  const openInApp = useCallback(() => {
    if (!urlToOpen) {
      return;
    }
    open(urlToOpen, '_blank');
  }, [urlToOpen]);

  if (urlToOpen) {
    return (
      <AuthPageContainer
        title={t['com.affine.auth.open.affine.redirect-title']()}
        subtitle={t['com.affine.auth.open.affine.redirect-title.hint']()}
      >
        <Button type="primary" size="large" onClick={openInApp}>
          {t['com.affine.auth.open.affine']()}
        </Button>
      </AuthPageContainer>
    );
  } else {
    return null;
  }
};
