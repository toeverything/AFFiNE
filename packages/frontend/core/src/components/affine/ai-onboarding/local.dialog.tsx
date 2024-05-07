import { Button, notify } from '@affine/component';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AiIcon } from '@blocksuite/icons';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect, useRef } from 'react';

import * as styles from './local.dialog.css';
import { edgelessNotifyId$, localNotifyId$ } from './state';
import type { BaseAIOnboardingDialogProps } from './type';

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
  const t = useAFFiNEI18N();
  return (
    <div className={styles.footerActions}>
      <Button onClick={onDismiss} type="plain" className={styles.actionButton}>
        <span style={{ color: cssVar('textSecondaryColor') }}>
          {t['com.affine.ai-onboarding.local.action-dismiss']()}
        </span>
      </Button>
      <a href="https://ai.affine.pro" target="_blank" rel="noreferrer">
        <Button className={styles.actionButton} type="plain">
          <span style={{ color: cssVar('textPrimaryColor') }}>
            {t['com.affine.ai-onboarding.local.action-learn-more']()}
          </span>
        </Button>
      </a>
    </div>
  );
};

export const AIOnboardingLocal = ({
  onDismiss,
}: BaseAIOnboardingDialogProps) => {
  const t = useAFFiNEI18N();
  const workspaceService = useService(WorkspaceService);
  const notifyId = useLiveData(localNotifyId$);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const isLocal = workspaceService.workspace.flavour === WorkspaceFlavour.LOCAL;

  useEffect(() => {
    if (!isLocal) return;
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
          onDismiss,
          footer: (
            <FooterActions
              onDismiss={() => {
                onDismiss();
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
  }, [isLocal, notifyId, onDismiss, t]);

  return null;
};
