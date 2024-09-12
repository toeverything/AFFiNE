import {
  RouteLogic,
  useNavigateHelper,
} from '@affine/core/hooks/use-navigate-helper';
import { AuthService } from '@affine/core/modules/cloud';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useNavigate, useSearchParams } from 'react-router-dom';

import { MobileSignIn } from '../views/sign-in/mobile-sign-in';

export const Component = () => {
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

  return <MobileSignIn onSkip={() => navigate('/')} />;
};
