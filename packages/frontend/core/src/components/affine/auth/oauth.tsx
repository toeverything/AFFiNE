import { notify, Skeleton } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { track } from '@affine/core/mixpanel';
import { popupWindow } from '@affine/core/utils';
import { apis } from '@affine/electron-api';
import { OAuthProviderType } from '@affine/graphql';
import { GithubIcon, GoogleDuotoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import useSWR from 'swr';

import { AuthService, ServerConfigService } from '../../../modules/cloud';

const OAuthProviderMap: Record<
  OAuthProviderType,
  {
    icon: ReactElement;
  }
> = {
  [OAuthProviderType.Google]: {
    icon: <GoogleDuotoneIcon />,
  },

  [OAuthProviderType.GitHub]: {
    icon: <GithubIcon />,
  },

  [OAuthProviderType.OIDC]: {
    // TODO(@catsjuice): Add OIDC icon
    icon: <GoogleDuotoneIcon />,
  },
};

export function OAuth() {
  const serverConfig = useService(ServerConfigService).serverConfig;
  const oauth = useLiveData(serverConfig.features$.map(r => r?.oauth));
  const oauthProviders = useLiveData(
    serverConfig.config$.map(r => r?.oauthProviders)
  );

  if (!oauth) {
    return <Skeleton height={50} />;
  }

  return oauthProviders?.map(provider => (
    <OAuthProvider key={provider} provider={provider} />
  ));
}

const usePreflightUrl = (provider: OAuthProviderType) => {
  const authService = useService(AuthService);
  const preflightFetcher = useMemo(() => {
    return async () => {
      const url = await authService.oauthPreflight(provider);
      return url;
    };
  }, [authService, provider]);

  const { data, isLoading, isValidating, mutate } = useSWR<string>(
    'preflight:' + provider,
    preflightFetcher,
    {
      onError: err => {
        console.error(err);
        notify.error({ title: 'Failed to sign in, please try again.' });
      },
    }
  );

  return { url: data, isLoading, isValidating, revalidate: mutate };
};

function OAuthProvider({ provider }: { provider: OAuthProviderType }) {
  const { icon } = OAuthProviderMap[provider];
  const { url, isValidating, revalidate } = usePreflightUrl(provider);

  const onClick = useAsyncCallback(async () => {
    try {
      if (!url || isValidating) {
        return;
      }
      if (environment.isElectron) {
        await apis?.ui.openExternal(url);
      } else {
        popupWindow(url);
      }
      await revalidate();
    } catch (err) {
      console.error(err);
      notify.error({ title: 'Failed to sign in, please try again.' });
    } finally {
      track.$.$.auth.oauth({ provider });
    }
  }, [url, isValidating, revalidate, provider]);

  if (!url) {
    return <Skeleton height={50} />;
  }

  return (
    <Button
      key={provider}
      variant="primary"
      block
      size="extraLarge"
      style={{ marginTop: 30, width: '100%' }}
      prefix={icon}
      onClick={onClick}
    >
      Continue with {provider}
      {isValidating && '...'}
    </Button>
  );
}
