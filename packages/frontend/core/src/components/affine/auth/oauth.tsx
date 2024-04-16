import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { OAuthProviderType } from '@affine/graphql';
import { GithubIcon, GoogleDuotoneIcon } from '@blocksuite/icons';
import { useLiveData, useService } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { AuthService, ServerConfigService } from '../../../modules/cloud';
import { mixpanel } from '../../../utils';

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
};

export function OAuth() {
  const serverConfig = useService(ServerConfigService).serverConfig;
  useEffect(() => {
    // load server config
    serverConfig.revalidateIfNeeded();
  }, [serverConfig]);
  const oauth = useLiveData(serverConfig.features$.map(r => r?.oauth));
  const oauthProviders = useLiveData(
    serverConfig.config$.map(r => r?.oauthProviders)
  );

  if (!oauth) {
    // TODO: loading & error UI
    return null;
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
    setIsConnecting(true);
    await authService.signInOauth(provider);
    mixpanel.track('OAuth', { provider });
  }, [authService, provider]);

  return (
    <Button
      key={provider}
      type="primary"
      block
      size="extraLarge"
      style={{ marginTop: 30 }}
      icon={icon}
      onClick={onClick}
    >
      Continue with {provider}
      {isConnecting && '...'}
    </Button>
  );
}
