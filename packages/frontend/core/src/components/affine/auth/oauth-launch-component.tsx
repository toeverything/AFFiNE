import { notify } from '@affine/component/ui/notification';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import { OAuthProviderType } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

export function OAuthLaunchComponent({
  onAuthenticated,
  redirectUrl,
}: {
  onAuthenticated?: (status: AuthSessionStatus) => void;
  redirectUrl?: string;
}) {
  const serverService = useService(ServerService);
  const urlService = useService(UrlService);
  const auth = useService(AuthService);
  const loginStatus = useLiveData(auth.session.status$);
  const t = useI18n();

  const effectiveRedirectUrl =
    redirectUrl ?? serverService.server.baseUrl + '/oauth/callback';

  const onContinue = useAsyncCallback(
    async (provider: OAuthProviderType) => {
      track.$.$.auth.signIn({ method: 'oauth', provider });

      const open: () => Promise<void> | void = BUILD_CONFIG.isNative
        ? async () => {
            try {
              const scheme = urlService.getClientScheme();
              const options = await auth.oauthPreflight(
                provider,
                scheme ?? 'web'
              );
              urlService.openPopupWindow(options.url);
            } catch (e) {
              notify.error(UserFriendlyError.fromAny(e));
            }
          }
        : () => {
            const params = new URLSearchParams();

            params.set('provider', provider);

            if (effectiveRedirectUrl) {
              params.set('redirect_uri', effectiveRedirectUrl);
            }

            const oauthUrl =
              serverService.server.baseUrl +
              `/oauth/login?${params.toString()}`;

            urlService.openPopupWindow(oauthUrl);
          };

      const ret = open();

      if (ret instanceof Promise) {
        await ret;
      }
    },
    [urlService, effectiveRedirectUrl, serverService, auth]
  );

  const provider = OAuthProviderType.OIDC;

  useEffect(() => {
    if (loginStatus === 'authenticated') {
      notify.success({
        title: t['com.affine.auth.toast.title.signed-in'](),
        message: t['com.affine.auth.toast.message.signed-in'](),
      });
    }
    onAuthenticated?.(loginStatus);
  }, [loginStatus, onAuthenticated, t]);

  useEffect(() => {
    onContinue(provider);
  }, [onContinue, provider]);

  return <h1>Logging in with OIDC</h1>;
}
