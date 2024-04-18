import { notify } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/atoms';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AiIcon } from '@blocksuite/icons';
import {
  DocService,
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useAtomValue } from 'jotai';
import Lottie from 'lottie-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef } from 'react';

import * as styles from './edgeless.dialog.css';
import mouseTrackDark from './lottie/edgeless/mouse-track-dark.json';
import mouseTrackLight from './lottie/edgeless/mouse-track-light.json';
import {
  edgelessNotifyId$,
  localNotifyId$,
  showAIOnboardingGeneral$,
} from './state';
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
  const { workspaceService, docService } = useServices({
    WorkspaceService,
    DocService,
  });

  const t = useAFFiNEI18N();
  const notifyId = useLiveData(edgelessNotifyId$);
  const generalAIOnboardingOpened = useLiveData(showAIOnboardingGeneral$);
  const settingModalOpen = useAtomValue(openSettingModalAtom);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isCloud =
    workspaceService.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  const doc = docService.doc;
  const mode = useLiveData(doc.mode$);

  useEffect(() => {
    if (settingModalOpen.open) return;
    if (generalAIOnboardingOpened) return;
    if (notifyId) return;
    if (mode !== 'edgeless') return;
    if (!isCloud) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      // try to close local onboarding
      notify.dismiss(localNotifyId$.value);

      const id = notify(
        {
          title: t['com.affine.ai-onboarding.edgeless.title'](),
          message: t['com.affine.ai-onboarding.edgeless.message'](),
          icon: <AiIcon />,
          iconColor: cssVar('processingColor'),
          thumb: <EdgelessOnboardingAnimation />,
          alignMessage: 'icon',
          onDismiss,
        },
        { duration: 1000 * 60 * 10 }
      );
      edgelessNotifyId$.next(id);
    }, 1000);
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
