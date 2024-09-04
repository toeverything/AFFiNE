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
import { useState } from 'react';

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

function OAuthProvider({ provider }: { provider: OAuthProviderType }) {
  const { icon } = OAuthProviderMap[provider];
  const authService = useService(AuthService);
  const [isConnecting, setIsConnecting] = useState(false);

  const onClick = useAsyncCallback(async () => {
    try {
      setIsConnecting(true);
      const url = await authService.oauthPreflight(provider);
      if (environment.isDesktop) {
        await apis?.ui.openExternal(url);
      } else {
        popupWindow(url);
      }
    } catch (err) {
      console.error(err);
      notify.error({ title: 'Failed to sign in, please try again.' });
    } finally {
      setIsConnecting(false);
      track.$.$.auth.oauth({ provider });
    }
  }, [authService, provider]);

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
      {isConnecting && '...'}
    </Button>
  );
}
