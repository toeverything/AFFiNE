import { notify } from '@affine/component';
import { AffineOtherPageLayout } from '@affine/component/affine-other-page-layout';
import { SignInPageContainer } from '@affine/component/auth-components';
import { OAuthLaunchComponent } from '@affine/core/components/affine/auth';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { useI18n } from '@affine/i18n';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';

export const OAuthLaunch = ({
  redirectUrl: redirectUrlFromProps,
}: {
  redirectUrl?: string;
}) => {
  const t = useI18n();
  const navigate = useNavigate();
  const { jumpToIndex } = useNavigateHelper();
  const [searchParams] = useSearchParams();
  const redirectUrl = redirectUrlFromProps ?? searchParams.get('redirect_uri');

  const error = searchParams.get('error');

  useEffect(() => {
    if (error) {
      notify.error({
        title: t['com.affine.auth.toast.title.failed'](),
        message: error,
      });
    }
  }, [error, t]);

  const handleClose = useCallback(() => {
    jumpToIndex(RouteLogic.REPLACE, {
      search: searchParams.toString(),
    });
  }, [jumpToIndex, searchParams]);

  const handleAuthenticated = useCallback(
    (status: AuthSessionStatus) => {
      if (status === 'authenticated') {
        if (redirectUrl) {
          if (redirectUrl.toUpperCase() === 'CLOSE_POPUP') {
            window.close();
            return;
          }
          navigate(redirectUrl, {
            replace: true,
          });
        } else {
          handleClose();
        }
      }
    },
    [handleClose, navigate, redirectUrl]
  );

  return (
    <SignInPageContainer>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <OAuthLaunchComponent onAuthenticated={handleAuthenticated} />
      </div>
    </SignInPageContainer>
  );
};

export const Component = () => {
  return (
    <AffineOtherPageLayout>
      <OAuthLaunch />
    </AffineOtherPageLayout>
  );
};
