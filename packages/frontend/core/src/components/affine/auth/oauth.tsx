import { Skeleton } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { popupWindow } from '@affine/core/utils';
import { appInfo } from '@affine/electron-api';
import { OAuthProviderType } from '@affine/graphql';
import { GithubIcon, GoogleDuotoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactElement, useCallback } from 'react';

import { ServerConfigService } from '../../../modules/cloud';

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

export function OAuth({ redirectUrl }: { redirectUrl?: string }) {
  const serverConfig = useService(ServerConfigService).serverConfig;
  const oauth = useLiveData(serverConfig.features$.map(r => r?.oauth));
  const oauthProviders = useLiveData(
    serverConfig.config$.map(r => r?.oauthProviders)
  );

  if (!oauth) {
    return <Skeleton height={50} />;
  }

  return oauthProviders?.map(provider => (
    <OAuthProvider
      key={provider}
      provider={provider}
      redirectUrl={redirectUrl}
    />
  ));
}

function OAuthProvider({
  provider,
  redirectUrl,
}: {
  provider: OAuthProviderType;
  redirectUrl?: string;
}) {
  const { icon } = OAuthProviderMap[provider];

  const onClick = useCallback(() => {
    const params = new URLSearchParams();

    params.set('provider', provider);

    if (redirectUrl) {
      params.set('redirect_uri', redirectUrl);
    }

    if (BUILD_CONFIG.isElectron && appInfo) {
      params.set('client', appInfo.schema);
    }

    const oauthUrl =
      (BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
        ? BUILD_CONFIG.serverUrlPrefix
        : '') + `/oauth/login?${params.toString()}`;

    popupWindow(oauthUrl);
  }, [provider, redirectUrl]);

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
    </Button>
  );
}
