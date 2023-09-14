import { SignInPageContainer } from '@affine/component/auth-components';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useLocation, useNavigate } from 'react-router-dom';

import { authAtom } from '../atoms';
import { AuthPanel } from '../components/affine/auth';
import { useCurrentLoginStatus } from '../hooks/affine/use-current-login-status';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

interface LocationState {
  state?: {
    callbackURL?: string;
  };
}
export const Component = () => {
  const [{ state, email = '', emailType = 'changePassword' }, setAuthAtom] =
    useAtom(authAtom);
  const loginStatus = useCurrentLoginStatus();
  const location = useLocation() as LocationState;
  const navigate = useNavigate();
  const { jumpToIndex } = useNavigateHelper();

  useEffect(() => {
    if (loginStatus === 'authenticated') {
      if (location.state?.callbackURL) {
        navigate(location.state.callbackURL, {
          replace: true,
        });
      } else {
        jumpToIndex(RouteLogic.REPLACE);
      }
    }
  }, [
    jumpToIndex,
    location.state?.callbackURL,
    loginStatus,
    navigate,
    setAuthAtom,
  ]);

  return (
    <SignInPageContainer>
      <AuthPanel
        state={state}
        email={email}
        emailType={emailType}
        setEmailType={useCallback(
          emailType => {
            setAuthAtom(prev => ({ ...prev, emailType }));
          },
          [setAuthAtom]
        )}
        setAuthState={useCallback(
          state => {
            setAuthAtom(prev => ({ ...prev, state }));
          },
          [setAuthAtom]
        )}
        setAuthEmail={useCallback(
          email => {
            setAuthAtom(prev => ({ ...prev, email }));
          },
          [setAuthAtom]
        )}
      />
    </SignInPageContainer>
  );
};
