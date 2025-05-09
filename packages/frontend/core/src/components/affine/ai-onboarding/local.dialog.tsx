import { type Notification, notify } from '@affine/component';
import {
  RouteLogic,
  useNavigateHelper,
} from '@affine/core/components/hooks/use-navigate-helper';
import { AuthService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { AiIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect, useMemo, useRef } from 'react';

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

export const AIOnboardingLocal = () => {
  const t = useI18n();
  const authService = useService(AuthService);
  const notifyId = useLiveData(localNotifyId$);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { jumpToSignIn } = useNavigateHelper();

  const loginStatus = useLiveData(authService.session.status$);
  const notSignedIn = loginStatus !== 'authenticated';

  const actions = useMemo(() => {
    const result: NonNullable<Notification['actions']> = [
      {
        key: 'learn-more',
        label: t['com.affine.ai-onboarding.local.action-learn-more'](),
        onClick: () => {
          window.open('https://ai.affine.pro', '_blank', 'noreferrer');
        },
      },
    ];
    if (notSignedIn) {
      result.push({
        key: 'get-started',
        label: t['com.affine.ai-onboarding.local.action-get-started'](),
        onClick: () => {
          jumpToSignIn('', RouteLogic.REPLACE, {}, { initCloud: 'true' });
        },
      });
    }

    return result;
  }, [t, jumpToSignIn, notSignedIn]);

  useEffect(() => {
    // if (!notSignedIn) return;
    if (notifyId) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
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
          actions,
          rootAttrs: { className: styles.card },
        },
        { duration: 1000 * 60 * 10 }
      );
      localNotifyId$.next(id);
    }, 1000);
  }, [actions, notSignedIn, notifyId, t]);

  return null;
};
