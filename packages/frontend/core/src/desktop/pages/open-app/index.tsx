import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { AuthService } from '@affine/core/modules/cloud';
import {
  buildAuthenticationDeepLink,
  buildOpenAppUrlRoute,
  normalizeOpenAppSignInNextParam,
} from '@affine/core/modules/open-in-app';
import { OpenInAppPage } from '@affine/core/modules/open-in-app/views/open-in-app-page';
import {
  appSchemaUrl,
  appSchemes,
  channelToScheme,
} from '@affine/core/utils/channel';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { AppContainer } from '../../components/app-container';

const OpenUrl = () => {
  const [params] = useSearchParams();
  const urlToOpen = params.get('url');
  const navigateHelper = useNavigateHelper();

  const onOpenHere = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      navigateHelper.jumpToIndex();
    },
    [navigateHelper]
  );

  const parsed = appSchemaUrl.safeParse(urlToOpen);
  if (!parsed.success) {
    console.error(parsed.error);
    return null;
  }

  const urlObj = new URL(parsed.data);
  params.forEach((v, k) => {
    if (k === 'url') {
      return;
    }
    urlObj.searchParams.set(k, v);
  });

  return (
    <OpenInAppPage urlToOpen={urlObj.toString()} openHereClicked={onOpenHere} />
  );
};

/**
 * @deprecated
 */
const OpenAppSignInRedirect = () => {
  const authService = useService(AuthService);
  const [params] = useSearchParams();
  const triggeredRef = useRef(false);
  const navigate = useNavigate();

  const maybeScheme = appSchemes.safeParse(params.get('scheme'));
  const scheme = maybeScheme.success
    ? maybeScheme.data
    : channelToScheme[BUILD_CONFIG.appBuildType];
  const next = normalizeOpenAppSignInNextParam(
    params.get('next'),
    location.origin
  );

  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;

    authService
      .createOpenAppSignInCode()
      .then(code => {
        const urlToOpen = buildAuthenticationDeepLink({
          scheme,
          method: 'open-app-signin',
          payload: next ? { code, next } : { code },
          server: location.origin,
        });
        navigate(buildOpenAppUrlRoute(urlToOpen), { replace: true });
      })
      .catch(console.error);
  }, [authService, navigate, next, scheme]);

  return <AppContainer fallback />;
};

export const Component = () => {
  const params = useParams<{ action: string }>();
  const action = params.action || '';

  if (action === 'url') {
    return <OpenUrl />;
  } else if (action === 'signin-redirect') {
    return <OpenAppSignInRedirect />;
  }
  return null;
};
