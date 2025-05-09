import { Button } from '@affine/component/ui/button';
import { notify } from '@affine/component/ui/notification';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import { type UserFriendlyError } from '@affine/error';
import { OAuthProviderType } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { GithubIcon, GoogleIcon, LockIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactElement, type SVGAttributes } from 'react';

const OAuthProviderMap: Record<
  OAuthProviderType,
  {
    icon: ReactElement<SVGAttributes<SVGElement>>;
  }
> = {
  [OAuthProviderType.Google]: {
    icon: <GoogleIcon />,
  },

  [OAuthProviderType.GitHub]: {
    icon: <GithubIcon />,
  },

  [OAuthProviderType.OIDC]: {
    icon: <LockIcon />,
  },
};

export function OAuth({ redirectUrl }: { redirectUrl?: string }) {
  const serverService = useService(ServerService);
  const urlService = useService(UrlService);
  const oauth = useLiveData(serverService.server.features$.map(r => r?.oauth));
  const oauthProviders = useLiveData(
    serverService.server.config$.map(r => r?.oauthProviders)
  );
  const scheme = urlService.getClientScheme();

  if (!oauth) {
    return null;
  }

  return oauthProviders?.map(provider => (
    <OAuthProvider
      key={provider}
      provider={provider}
      redirectUrl={redirectUrl}
      scheme={scheme}
      popupWindow={url => {
        urlService.openPopupWindow(url);
      }}
    />
  ));
}

function OAuthProvider({
  provider,
  redirectUrl,
  scheme,
  popupWindow,
}: {
  provider: OAuthProviderType;
  redirectUrl?: string;
  scheme?: string;
  popupWindow: (url: string) => void;
}) {
  const serverService = useService(ServerService);
  const auth = useService(AuthService);
  const { icon } = OAuthProviderMap[provider];
  const t = useI18n();

  const onClick = useAsyncCallback(async () => {
    if (scheme && BUILD_CONFIG.isNative) {
      let oauthUrl = '';
      try {
        oauthUrl = await auth.oauthPreflight(provider, scheme);
      } catch (e) {
        console.error(e);
        const err = e as UserFriendlyError;
        notify.error({
          title: t[`error.${err.name}`](err.data),
        });
        return;
      }
      popupWindow(oauthUrl);
      return;
    }

    const params = new URLSearchParams();

    params.set('provider', provider);

    if (redirectUrl) {
      params.set('redirect_uri', redirectUrl);
    }

    if (scheme) {
      params.set('client', scheme);
    }

    // TODO: Android app scheme not implemented
    // if (BUILD_CONFIG.isAndroid) {}

    const oauthUrl =
      serverService.server.baseUrl + `/oauth/login?${params.toString()}`;

    track.$.$.auth.signIn({ method: 'oauth', provider });

    popupWindow(oauthUrl);
  }, [popupWindow, provider, redirectUrl, scheme, serverService, auth, t]);

  return (
    <Button
      key={provider}
      variant="primary"
      block
      size="extraLarge"
      style={{ width: '100%' }}
      prefix={icon}
      onClick={onClick}
    >
      Continue with {provider}
    </Button>
  );
}
