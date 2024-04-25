import { Button, IconButton, Modal } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/atoms';
import { useBlurRoot } from '@affine/core/hooks/use-blur-root';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon } from '@blocksuite/icons';
import {
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as baseStyles from './base-style.css';
import * as styles from './general.dialog.css';
import { Slider } from './slider';
import { showAIOnboardingGeneral$ } from './state';
import type { BaseAIOnboardingDialogProps } from './type';

type PlayListItem = { video: string; title: ReactNode; desc: ReactNode };
type Translate = ReturnType<typeof useAFFiNEI18N>;

const getPlayList = (t: Translate): Array<PlayListItem> => [
  {
    video: '/onboarding/ai-onboarding.general.1.mov',
    title: t['com.affine.ai-onboarding.general.1.title'](),
    desc: t['com.affine.ai-onboarding.general.1.description'](),
  },
  {
    video: '/onboarding/ai-onboarding.general.2.mov',
    title: t['com.affine.ai-onboarding.general.2.title'](),
    desc: t['com.affine.ai-onboarding.general.2.description'](),
  },
  {
    video: '/onboarding/ai-onboarding.general.3.mov',
    title: t['com.affine.ai-onboarding.general.3.title'](),
    desc: t['com.affine.ai-onboarding.general.3.description'](),
  },
  {
    video: '/onboarding/ai-onboarding.general.4.mov',
    title: t['com.affine.ai-onboarding.general.4.title'](),
    desc: t['com.affine.ai-onboarding.general.4.description'](),
  },
  {
    video: '/onboarding/ai-onboarding.general.1.mov',
    title: t['com.affine.ai-onboarding.general.5.title'](),
    desc: (
      <Trans
        i18nKey="com.affine.ai-onboarding.general.5.description"
        values={{ link: 'ai.affine.pro' }}
        components={{
          a: (
            <a
              className={styles.link}
              href="https://ai.affine.pro"
              target="_blank"
              rel="noreferrer"
            />
          ),
        }}
      />
    ),
  },
];

export const AIOnboardingGeneral = ({
  onDismiss,
}: BaseAIOnboardingDialogProps) => {
  const { workspaceService, subscriptionService } = useServices({
    WorkspaceService,
    SubscriptionService,
  });

  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  const prevVideoRef = useRef<HTMLVideoElement | null>(null);
  const isCloud =
    workspaceService.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const t = useAFFiNEI18N();
  const open = useLiveData(showAIOnboardingGeneral$);
  const aiSubscription = useLiveData(subscriptionService.subscription.ai$);
  const [index, setIndex] = useState(0);
  const list = useMemo(() => getPlayList(t), [t]);
  const setSettingModal = useSetAtom(openSettingModalAtom);
  useBlurRoot(open && isCloud);

  const isFirst = index === 0;
  const isLast = index === list.length - 1;

  const remindLater = useCallback(() => {
    showAIOnboardingGeneral$.next(false);
  }, []);
  const closeAndDismiss = useCallback(() => {
    showAIOnboardingGeneral$.next(false);
    onDismiss();
  }, [onDismiss]);
  const goToPricingPlans = useCallback(() => {
    setSettingModal({
      open: true,
      activeTab: 'plans',
      scrollAnchor: 'aiPricingPlan',
    });
    closeAndDismiss();
  }, [closeAndDismiss, setSettingModal]);
  const onPrev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1));
  }, []);
  const onNext = useCallback(() => {
    setIndex(i => Math.min(list.length - 1, i + 1));
  }, [list.length]);

  useEffect(() => {
    subscriptionService.subscription.revalidate();
  }, [subscriptionService]);

  const videoRenderer = useCallback(
    ({ video }: PlayListItem, index: number) => (
      <div className={styles.videoWrapper}>
        <video
          autoPlay={index === 0}
          src={video}
          className={styles.video}
          loop
          muted
          playsInline
        />
      </div>
    ),
    []
  );
  const titleRenderer = useCallback(
    ({ title }: PlayListItem) => <h1 className={styles.title}>{title}</h1>,
    []
  );
  const descriptionRenderer = useCallback(
    ({ desc }: PlayListItem) => <p className={styles.description}>{desc}</p>,
    []
  );

  // show dialog when it's mounted
  useEffect(() => {
    showAIOnboardingGeneral$.next(true);
  }, []);

  useEffect(() => {
    const videoWrapper = videoWrapperRef.current;
    if (!videoWrapper) return;

    const videos = videoWrapper.querySelectorAll('video');
    const video = videos[index];
    if (!video) return;

    if (prevVideoRef.current) {
      prevVideoRef.current.pause();
    }

    video.play().catch(console.error);
    prevVideoRef.current = video;
  }, [index]);

  return isCloud ? (
    <Modal
      open={open}
      onOpenChange={v => {
        showAIOnboardingGeneral$.next(v);
        if (!v && isLast) onDismiss();
      }}
      contentOptions={{ className: styles.dialog }}
      overlayOptions={{ className: baseStyles.dialogOverlay }}
    >
      <div className={styles.dialogContent}>
        <Slider<PlayListItem>
          rootRef={videoWrapperRef}
          className={styles.videoHeader}
          items={list}
          activeIndex={index}
          preload={5}
          itemRenderer={videoRenderer}
        />

        <main className={styles.mainContent}>
          <Slider<PlayListItem>
            items={list}
            activeIndex={index}
            itemRenderer={titleRenderer}
            transitionDuration={400}
          />
          <Slider<PlayListItem>
            items={list}
            activeIndex={index}
            itemRenderer={descriptionRenderer}
            transitionDuration={500}
          />
        </main>

        <section
          className={styles.privacy}
          aria-hidden={!isLast || !!aiSubscription}
        >
          <Trans
            i18nKey="com.affine.ai-onboarding.general.privacy"
            components={{
              a: (
                <a
                  className={styles.privacyLink}
                  href="https://ai.affine.pro"
                />
              ),
            }}
          />
        </section>

        <footer
          className={styles.footer}
          data-is-last={isLast}
          data-is-first={isFirst}
        >
          {isLast ? (
            <>
              <IconButton
                size="default"
                icon={<ArrowLeftSmallIcon width={20} height={20} />}
                onClick={onPrev}
                type="plain"
                className={styles.baseActionButton}
              />
              {aiSubscription ? (
                <Button
                  className={styles.baseActionButton}
                  size="large"
                  onClick={closeAndDismiss}
                  type="primary"
                >
                  {t['com.affine.ai-onboarding.general.get-started']()}
                </Button>
              ) : (
                <div className={styles.subscribeActions}>
                  <Button
                    className={styles.baseActionButton}
                    size="large"
                    onClick={closeAndDismiss}
                  >
                    {t['com.affine.ai-onboarding.general.try-for-free']()}
                  </Button>
                  <Button
                    className={styles.baseActionButton}
                    size="large"
                    onClick={goToPricingPlans}
                    type="primary"
                  >
                    {t['com.affine.ai-onboarding.general.purchase']()}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {isFirst ? (
                <Button
                  className={styles.transparentActionButton}
                  onClick={remindLater}
                  size="large"
                  type="default"
                >
                  {t['com.affine.ai-onboarding.general.skip']()}
                </Button>
              ) : (
                <Button
                  icon={<ArrowLeftSmallIcon />}
                  className={styles.baseActionButton}
                  onClick={onPrev}
                  type="plain"
                  size="large"
                >
                  {t['com.affine.ai-onboarding.general.prev']()}
                </Button>
              )}
              <div className={styles.actionAndIndicator}>
                <div>
                  {index + 1} / {list.length}
                </div>
                <Button
                  className={styles.baseActionButton}
                  size="large"
                  type="primary"
                  onClick={onNext}
                >
                  {t['com.affine.ai-onboarding.general.next']()}
                </Button>
              </div>
            </>
          )}
        </footer>
      </div>
    </Modal>
  ) : null;
};
