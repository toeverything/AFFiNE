import { AffineOtherPageLayout } from '@affine/component/affine-other-page-layout';
import { SignInPageContainer } from '@affine/component/auth-components';
import { AuthService } from '@affine/core/modules/cloud';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useNavigate, useSearchParams } from 'react-router-dom';

import { authAtom } from '../atoms';
import type { AuthProps } from '../components/affine/auth';
import { AuthPanel } from '../components/affine/auth';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

export const SignIn = () => {
  const [{ state, email = '', emailType = 'changePassword' }, setAuthAtom] =
    useAtom(authAtom);
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
  }, [jumpToIndex, navigate, setAuthAtom, isLoggedIn, searchParams]);

  const onSetEmailType = useCallback(
    (emailType: AuthProps['emailType']) => {
      setAuthAtom(prev => ({ ...prev, emailType }));
    },
    [setAuthAtom]
  );

  const onSetAuthState = useCallback(
    (state: AuthProps['state']) => {
      setAuthAtom(prev => ({ ...prev, state }));
    },
    [setAuthAtom]
  );

  const onSetAuthEmail = useCallback(
    (email: AuthProps['email']) => {
      setAuthAtom(prev => ({ ...prev, email }));
    },
    [setAuthAtom]
  );

  return (
    <SignInPageContainer>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <AuthPanel
          state={state}
          email={email}
          emailType={emailType}
          setEmailType={onSetEmailType}
          setAuthState={onSetAuthState}
          setAuthEmail={onSetAuthEmail}
        />
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
