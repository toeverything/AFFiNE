import { AffineOtherPageLayout } from '@affine/component/affine-other-page-layout';
import { SignInPageContainer } from '@affine/component/auth-components';
import { AuthService } from '@affine/core/modules/cloud';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AuthPanel } from '../../components/affine/auth';
import { RouteLogic, useNavigateHelper } from '../../hooks/use-navigate-helper';

export const SignIn = () => {
  const session = useService(AuthService).session;
  const status = useLiveData(session.status$);
  const isRevalidating = useLiveData(session.isRevalidating$);
  const navigate = useNavigate();
  const { jumpToIndex } = useNavigateHelper();
  const [searchParams] = useSearchParams();
  const isLoggedIn = status === 'authenticated' && !isRevalidating;

  useEffect(() => {
    if (isLoggedIn) {
      const redirectUri = searchParams.get('redirect_uri');
      if (redirectUri) {
        navigate(redirectUri, {
          replace: true,
        });
      } else {
        jumpToIndex(RouteLogic.REPLACE, {
          search: searchParams.toString(),
        });
      }
    }
  }, [jumpToIndex, navigate, isLoggedIn, searchParams]);

  return (
    <SignInPageContainer>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <AuthPanel onSkip={jumpToIndex} />
      </div>
    </SignInPageContainer>
  );
};

export const Component = () => {
  return (
    <AffineOtherPageLayout>
      <div style={{ padding: '0 20px' }}>
        <SignIn />
      </div>
    </AffineOtherPageLayout>
  );
};
