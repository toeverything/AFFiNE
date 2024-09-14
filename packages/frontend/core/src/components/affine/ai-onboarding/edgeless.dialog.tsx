import { Button, FlexWrapper, notify } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/components/atoms';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { EditorService } from '@affine/core/modules/editor';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { AiIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useAtomValue, useSetAtom } from 'jotai';
import Lottie from 'lottie-react';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { toggleEdgelessAIOnboarding } from './apis';
import * as styles from './edgeless.dialog.css';
import mouseTrackDark from './lottie/edgeless/mouse-track-dark.json';
import mouseTrackLight from './lottie/edgeless/mouse-track-light.json';
import {
  edgelessNotifyId$,
  localNotifyId$,
  showAIOnboardingGeneral$,
} from './state';

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

export const AIOnboardingEdgeless = () => {
  const { subscriptionService, editorService } = useServices({
    SubscriptionService,
    EditorService,
  });

  const t = useI18n();
  const notifyId = useLiveData(edgelessNotifyId$);
  const generalAIOnboardingOpened = useLiveData(showAIOnboardingGeneral$);
  const aiSubscription = useLiveData(subscriptionService.subscription.ai$);
  const settingModalOpen = useAtomValue(openSettingModalAtom);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const setSettingModal = useSetAtom(openSettingModalAtom);

  const mode = useLiveData(editorService.editor.mode$);

  const goToPricingPlans = useCallback(() => {
    track.$.aiOnboarding.dialog.viewPlans();
    setSettingModal({
      open: true,
      activeTab: 'plans',
      scrollAnchor: 'aiPricingPlan',
    });
  }, [setSettingModal]);

  useEffect(() => {
    if (settingModalOpen.open) return;
    if (generalAIOnboardingOpened) return;
    if (notifyId) return;
    if (mode !== 'edgeless') return;
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
          onDismiss: () => toggleEdgelessAIOnboarding(false),
          footer: (
            <FlexWrapper marginTop={8} justifyContent="flex-end" gap="12px">
              <Button
                onClick={() => {
                  notify.dismiss(id);
                  toggleEdgelessAIOnboarding(false);
                }}
                variant="plain"
                className={styles.actionButton}
              >
                <span className={styles.getStartedButtonText}>
                  {t['com.affine.ai-onboarding.edgeless.get-started']()}
                </span>
              </Button>
              {aiSubscription ? null : (
                <Button
                  className={styles.actionButton}
                  variant="plain"
                  onClick={() => {
                    goToPricingPlans();
                    notify.dismiss(id);
                    toggleEdgelessAIOnboarding(false);
                  }}
                >
                  <span className={styles.purchaseButtonText}>
                    {t['com.affine.ai-onboarding.edgeless.purchase']()}
                  </span>
                </Button>
              )}
            </FlexWrapper>
          ),
        },
        { duration: 1000 * 60 * 10 }
      );
      edgelessNotifyId$.next(id);
    }, 1000);
  }, [
    aiSubscription,
    generalAIOnboardingOpened,
    goToPricingPlans,
    mode,
    notifyId,
    settingModalOpen,
    t,
  ]);

  return null;
};
