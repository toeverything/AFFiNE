import { Button } from '@affine/component';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { NativePaywallService } from '@affine/core/modules/paywall';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import proDiamond from '../assets/pro-diamond.png';
import * as styles from './styles.css';

export const UserSubscription = () => {
  const serverService = useService(ServerService);
  const authService = useService(AuthService);
  const globalDialogService = useService(GlobalDialogService);
  const nativePaywallProvider =
    useService(NativePaywallService).getNativePaywallProvider();
  const t = useI18n();

  const supported = useLiveData(
    serverService.server.features$.map(f => f.payment)
  );
  const loggedIn = useLiveData(authService.session.status$) === 'authenticated';

  const handleOpen = useCallback(() => {
    if (!loggedIn) {
      globalDialogService.open('sign-in', {});
      return;
    }

    void nativePaywallProvider?.showPaywall('Pro').catch(console.error);
  }, [globalDialogService, loggedIn, nativePaywallProvider]);

  if (!nativePaywallProvider || supported === false) {
    return null;
  }

  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <div className={styles.title}>
          {t['com.affine.mobile.setting.subscription.title']()}
        </div>
        <div className={styles.perkRow}>
          <img className={styles.perkIcon} src={proDiamond} alt="" />
          <div className={styles.description}>
            {t['com.affine.mobile.setting.subscription.description']()}
          </div>
        </div>
      </div>
      <Button className={styles.button} variant="primary" onClick={handleOpen}>
        {t['com.affine.mobile.setting.subscription.button']()}
      </Button>
    </div>
  );
};
