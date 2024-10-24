import { Skeleton } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { AuthService, ServerConfigService } from '@affine/core/modules/cloud';
import { popupWindow } from '@affine/core/utils';
import { appInfo } from '@affine/electron-api';
import { OAuthProviderType } from '@affine/graphql';
import { GithubIcon, GoogleDuotoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactElement, useCallback } from 'react';

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
  const auth = useService(AuthService);
  const { icon } = OAuthProviderMap[provider];

  const onClick = useCallback(() => {
    async function preflight() {
      if (ignore) return;
      try {
        return await auth.oauthPreflight(provider, appInfo?.schema || '');
      } catch {
        return null;
      }
    }

    let ignore = false;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    preflight().then(url => {
      // cover popup limit in safari
      setTimeout(() => {
        if (url && !ignore) {
          popupWindow(url);
        }
      });
    });
    return () => {
      ignore = true;
    };
  }, [auth, provider]);

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
