import { Button } from '@affine/component/ui/button';
import {
  useOAuthProviders,
  useServerFeatures,
} from '@affine/core/hooks/affine/use-server-config';
import { OAuthProviderType } from '@affine/graphql';
import { GithubIcon, GoogleDuotoneIcon } from '@blocksuite/icons';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';

import { useAuth } from './use-auth';

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
  const { oauth } = useServerFeatures();

  if (!oauth) {
    return null;
  }

  return <OAuthProviders />;
}

function OAuthProviders() {
  const providers = useOAuthProviders();

  return providers.map(provider => (
    <OAuthProvider key={provider} provider={provider} />
  ));
}

function OAuthProvider({ provider }: { provider: OAuthProviderType }) {
  const { icon } = OAuthProviderMap[provider];
  const { oauthSignIn } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  const onClick = useCallback(() => {
    setIsConnecting(true);
    oauthSignIn(provider);
  }, [provider, oauthSignIn]);

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
