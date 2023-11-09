import { SignInPageContainer } from '@affine/component/auth-components';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useLocation, useNavigate } from 'react-router-dom';

import { authAtom } from '../atoms';
import { AuthPanel, type AuthProps } from '../components/affine/auth';
import { SubscriptionRedirect } from '../components/affine/auth/subscription-redirect';
import { useSubscriptionSearch } from '../components/affine/auth/use-subscription';
import { useCurrentLoginStatus } from '../hooks/affine/use-current-login-status';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

interface LocationState {
  state?: {
    callbackURL?: string;
  };
}
export const Component = () => {
  const paymentRedirectRef = useRef<'redirect' | 'ignore' | null>(null);
  const [{ state, email = '', emailType = 'changePassword' }, setAuthAtom] =
    useAtom(authAtom);
  const loginStatus = useCurrentLoginStatus();
  const location = useLocation() as LocationState;
  const navigate = useNavigate();
  const { jumpToIndex } = useNavigateHelper();
  const subscriptionData = useSubscriptionSearch();

  const isLoggedIn = loginStatus === 'authenticated';

  // Check payment redirect once after session loaded, to avoid unnecessary page rendering.
  if (loginStatus !== 'loading' && !paymentRedirectRef.current) {
    // If user is logged in and visit sign in page with subscription query, redirect to stripe payment page immediately.
    // Otherwise, user will login through email, and then redirect to payment page.
    paymentRedirectRef.current =
      subscriptionData && isLoggedIn ? 'redirect' : 'ignore';
  }

  useEffect(() => {
    if (paymentRedirectRef.current === 'redirect') {
      return;
    }

    if (isLoggedIn) {
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
    navigate,
    setAuthAtom,
    subscriptionData,
    isLoggedIn,
  ]);

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

  if (paymentRedirectRef.current === 'redirect') {
    return <SubscriptionRedirect />;
  }

  return (
    <SignInPageContainer>
      <AuthPanel
        state={state}
        email={email}
        emailType={emailType}
        setEmailType={onSetEmailType}
        setAuthState={onSetAuthState}
        setAuthEmail={onSetAuthEmail}
      />
    </SignInPageContainer>
  );
};
