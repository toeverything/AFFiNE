import { notify } from '@affine/component';
import { CurrentWorkspaceService } from '@affine/core/modules/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AiIcon } from '@blocksuite/icons';
import { Doc, LiveData, useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import Lottie from 'lottie-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef } from 'react';

import * as styles from './edgeless.dialog.css';
import mouseDark from './lottie/edgeless/mouse-dark.json';
import mouseLight from './lottie/edgeless/mouse-light.json';
import trackPadDark from './lottie/edgeless/trackpad-dark.json';
import trackPadLight from './lottie/edgeless/trackpad-light.json';
import type { BaseAIOnboardingDialogProps } from './type';

const EdgelessOnboardingAnimation = () => {
  const { resolvedTheme } = useTheme();

  const isTrackPad = false;

  const data = useMemo(() => {
    if (isTrackPad) {
      return resolvedTheme === 'dark' ? trackPadDark : trackPadLight;
    }
    return resolvedTheme === 'dark' ? mouseDark : mouseLight;
  }, [isTrackPad, resolvedTheme]);

  return <Lottie loop autoplay animationData={data} className={styles.thumb} />;
};

// avoid notifying multiple times
const notifyId$ = new LiveData<string | number | null>(null);

export const AIOnboardingEdgeless = ({
  onDismiss,
}: BaseAIOnboardingDialogProps) => {
  const t = useAFFiNEI18N();
  const notifyId = useLiveData(notifyId$);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace$
  );
  const isCloud = currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  const doc = useService(Doc);
  const mode = useLiveData(doc.mode$);

  useEffect(() => {
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
        notifyId$.next(id);
      }, 1000);
    }
  }, [isCloud, mode, notifyId, onDismiss, t]);

  return null;
};
