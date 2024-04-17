import { notify } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/atoms';
import { CurrentWorkspaceService } from '@affine/core/modules/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AiIcon } from '@blocksuite/icons';
import { Doc, useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useAtomValue } from 'jotai';
import Lottie from 'lottie-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef } from 'react';

import * as styles from './edgeless.dialog.css';
import mouseTrackDark from './lottie/edgeless/mouse-track-dark.json';
import mouseTrackLight from './lottie/edgeless/mouse-track-light.json';
import { edgelessNotifyId$, showAIOnboardingGeneral$ } from './state';
import type { BaseAIOnboardingDialogProps } from './type';

const EdgelessOnboardingAnimation = () => {
  const { resolvedTheme } = useTheme();

  const data = useMemo(() => {
    return resolvedTheme === 'dark' ? mouseTrackDark : mouseTrackLight;
  }, [resolvedTheme]);

  return (
    <div className={styles.thumb}>
      <Lottie
        loop
        autoplay
        animationData={data}
        className={styles.thumbContent}
      />
    </div>
  );
};

export const AIOnboardingEdgeless = ({
  onDismiss,
}: BaseAIOnboardingDialogProps) => {
  const t = useAFFiNEI18N();
  const notifyId = useLiveData(edgelessNotifyId$);
  const generalAIOnboardingOpened = useLiveData(showAIOnboardingGeneral$);
  const settingModalOpen = useAtomValue(openSettingModalAtom);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace$
  );
  const isCloud = currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  const doc = useService(Doc);
  const mode = useLiveData(doc.mode$);

  useEffect(() => {
    if (settingModalOpen.open) return;
    if (generalAIOnboardingOpened) return;
    if (notifyId) return;
    if (isCloud && mode === 'edgeless') {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const id = notify(
          {
            title: t['com.affine.ai-onboarding.edgeless.title'](),
            message: t['com.affine.ai-onboarding.edgeless.message'](),
            icon: <AiIcon color={cssVar('processingColor')} />,
            thumb: <EdgelessOnboardingAnimation />,
            alignMessage: 'icon',
            onDismiss,
          },
          { duration: 1000 * 60 * 10 }
        );
        edgelessNotifyId$.next(id);
      }, 1000);
    }
  }, [
    generalAIOnboardingOpened,
    isCloud,
    mode,
    notifyId,
    onDismiss,
    settingModalOpen,
    t,
  ]);

  return null;
};
