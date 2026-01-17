import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { AuthService } from '@affine/core/modules/cloud';
import { OpenInAppPage } from '@affine/core/modules/open-in-app/views/open-in-app-page';
import {
  appSchemaUrl,
  appSchemes,
  channelToScheme,
} from '@affine/core/utils/channel';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

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
  const [urlToOpen, setUrlToOpen] = useState<string | null>(null);

  const maybeScheme = appSchemes.safeParse(params.get('scheme'));
  const scheme = maybeScheme.success
    ? maybeScheme.data
    : channelToScheme[BUILD_CONFIG.appBuildType];
  const next = params.get('next') || undefined;

  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;

    authService
      .createOpenAppSignInCode()
      .then(code => {
        const authParams = new URLSearchParams();
        authParams.set('method', 'open-app-signin');
        authParams.set(
          'payload',
          JSON.stringify(next ? { code, next } : { code })
        );
        authParams.set('server', location.origin);
        setUrlToOpen(`${scheme}://authentication?${authParams.toString()}`);
      })
      .catch(console.error);
  }, [authService, next, scheme]);

  if (!urlToOpen) {
    return <AppContainer fallback />;
  }

  return <OpenInAppPage urlToOpen={urlToOpen} />;
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
