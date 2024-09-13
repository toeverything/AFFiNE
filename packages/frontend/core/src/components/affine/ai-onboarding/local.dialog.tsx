import { Button, notify } from '@affine/component';
import {
  RouteLogic,
  useNavigateHelper,
} from '@affine/core/components/hooks/use-navigate-helper';
import { AuthService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { AiIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect, useRef } from 'react';

import { toggleLocalAIOnboarding } from './apis';
import * as styles from './local.dialog.css';
import { edgelessNotifyId$, localNotifyId$ } from './state';

const LocalOnboardingAnimation = () => {
  return (
    <div className={styles.thumb}>
      <video
        className={styles.thumbContent}
        src="/onboarding/ai-onboarding.general.1.mp4"
        autoPlay
        loop
        muted
        playsInline
      />
    </div>
  );
};

const FooterActions = ({ onDismiss }: { onDismiss: () => void }) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const loginStatus = useLiveData(authService.session.status$);
  const loggedIn = loginStatus === 'authenticated';
  const { jumpToSignIn } = useNavigateHelper();

  return (
    <div className={styles.footerActions}>
      <a href="https://ai.affine.pro" target="_blank" rel="noreferrer">
        <Button
          className={styles.actionButton}
          variant="plain"
          onClick={onDismiss}
        >
          {t['com.affine.ai-onboarding.local.action-learn-more']()}
        </Button>
      </a>
      {loggedIn ? null : (
        <Button
          className={styles.actionButton}
          variant="plain"
          onClick={() => {
            onDismiss();
            jumpToSignIn('', RouteLogic.REPLACE, {}, { initCloud: 'true' });
          }}
        >
          {t['com.affine.ai-onboarding.local.action-get-started']()}
        </Button>
      )}
    </div>
  );
};

export const AIOnboardingLocal = () => {
  const t = useI18n();
  const authService = useService(AuthService);
  const notifyId = useLiveData(localNotifyId$);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const loginStatus = useLiveData(authService.session.status$);
  const notSignedIn = loginStatus !== 'authenticated';

  useEffect(() => {
    if (!notSignedIn) return;
    if (notifyId) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      // try to close edgeless onboarding
      notify.dismiss(edgelessNotifyId$.value);

      const id = notify(
        {
          title: (
            <div className={styles.title}>
              {t['com.affine.ai-onboarding.local.title']()}
            </div>
          ),
          message: t['com.affine.ai-onboarding.local.message'](),
          icon: <AiIcon />,
          iconColor: cssVar('brandColor'),
          thumb: <LocalOnboardingAnimation />,
          alignMessage: 'icon',
          onDismiss: () => toggleLocalAIOnboarding(false),
          footer: (
            <FooterActions
              onDismiss={() => {
                toggleLocalAIOnboarding(false);
                notify.dismiss(id);
              }}
            />
          ),
          rootAttrs: { className: styles.card },
        },
        { duration: 1000 * 60 * 10 }
      );
      localNotifyId$.next(id);
    }, 1000);
  }, [notSignedIn, notifyId, t]);

  return null;
};
