import { Button, Divider, IconButton } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import {
  openSettingModalAtom,
  type PlansScrollAnchor,
} from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { ArrowRightBigIcon, ArrowUpSmallIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useAtom, useAtomValue } from 'jotai';
import {
  type HtmlHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal, flushSync } from 'react-dom';

import { settingModalScrollContainerAtom } from '../../atoms';
import * as styles from './layout.css';

export const SeeAllLink = () => {
  const t = useI18n();

  return (
    <a
      className={styles.allPlansLink}
      href="https://affine.pro/pricing"
      target="_blank"
      rel="noopener noreferrer"
    >
      {t['com.affine.payment.see-all-plans']()}
      {<ArrowRightBigIcon width="16" height="16" />}
    </a>
  );
};

interface PricingCollapsibleProps
  extends Omit<HtmlHTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  caption?: ReactNode;
}
export const PricingCollapsible = ({
  title,
  caption,
  children,
}: PricingCollapsibleProps) => {
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => setOpen(prev => !prev), []);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <section className={styles.collapsibleHeader}>
        <div className={styles.collapsibleHeaderContent}>
          <div className={styles.collapsibleHeaderTitle}>{title}</div>
          <div className={styles.collapsibleHeaderCaption}>{caption}</div>
        </div>
        <IconButton onClick={toggle} size="20">
          <ArrowUpSmallIcon
            style={{
              transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.23s ease',
            }}
          />
        </IconButton>
      </section>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
};

export interface PlanLayoutProps {
  cloud?: ReactNode;
  ai?: ReactNode;
  cloudTip?: boolean;
}

export const PlanLayout = ({ cloud, ai, cloudTip }: PlanLayoutProps) => {
  const t = useI18n();
  const [modal, setOpenSettingModal] = useAtom(openSettingModalAtom);
  const scrollAnchor = modal.activeTab === 'plans' ? modal.scrollAnchor : null;
  const plansRootRef = useRef<HTMLDivElement>(null);
  const cloudScrollTipRef = useRef<HTMLDivElement>(null);
  const settingModalScrollContainer = useAtomValue(
    settingModalScrollContainerAtom
  );

  const updateCloudTipState = useCallback(() => {
    if (!cloudTip) return;
    const cloudContainer =
      plansRootRef.current?.querySelector('#cloudPricingPlan');
    if (!settingModalScrollContainer || !cloudContainer) return;

    const minVisibleHeight = 30;

    const containerRect = settingModalScrollContainer.getBoundingClientRect();
    const cloudTop =
      cloudContainer.getBoundingClientRect().top - containerRect.top;
    const cloudIntoView = cloudTop < containerRect.height - minVisibleHeight;
    if (cloudIntoView) {
      settingModalScrollContainer.dataset.cloudVisible = '';
    }
  }, [cloudTip, settingModalScrollContainer]);

  // TODO(@catsjuice): Need a better solution to handle this situation
  useLayoutEffect(() => {
    if (!scrollAnchor) return;
    flushSync(() => {
      const target = plansRootRef.current?.querySelector(`#${scrollAnchor}`);
      if (target) {
        target.scrollIntoView();
        setOpenSettingModal(prev => ({ ...prev, scrollAnchor: undefined }));
      }
    });
  }, [scrollAnchor, setOpenSettingModal]);

  useEffect(() => {
    if (!settingModalScrollContainer || !cloudScrollTipRef.current) return;

    settingModalScrollContainer.addEventListener('scroll', updateCloudTipState);
    updateCloudTipState();
    return () => {
      settingModalScrollContainer.removeEventListener(
        'scroll',
        updateCloudTipState
      );
    };
  }, [settingModalScrollContainer, updateCloudTipState]);

  const scrollToAnchor = useCallback((anchor: PlansScrollAnchor) => {
    const target = plansRootRef.current?.querySelector(`#${anchor}`);
    target && target.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.plansLayoutRoot} ref={plansRootRef}>
      {/* TODO(@catsjuice): SettingHeader component shouldn't have margin itself  */}
      <SettingHeader
        style={{ marginBottom: '0px' }}
        title={t['com.affine.payment.title']()}
      />
      {ai ? (
        <>
          <div id="aiPricingPlan">{ai}</div>
          <Divider className={styles.aiDivider} />
        </>
      ) : null}
      <div id="cloudPricingPlan">{cloud}</div>

      {cloudTip && settingModalScrollContainer
        ? createPortal(
            <div className={styles.aiScrollTip} ref={cloudScrollTipRef}>
              <div>
                <div className={styles.cloudScrollTipTitle}>
                  {t['com.affine.cloud-scroll-tip.title']()}
                </div>
                <div className={styles.cloudScrollTipCaption}>
                  {t['com.affine.cloud-scroll-tip.caption']()}
                </div>
              </div>
              <Button
                onClick={() => scrollToAnchor('cloudPricingPlan')}
                variant="primary"
              >
                {t['com.affine.ai-scroll-tip.view']()}
              </Button>
            </div>,
            settingModalScrollContainer,
            'aiScrollTip'
          )
        : null}
    </div>
  );
};

export interface PlanCardProps {
  title?: ReactNode;
  caption?: ReactNode;
  select?: ReactNode;
  toggle?: ReactNode;
  scroll?: ReactNode;
  lifetime?: ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement>;
}
export const CloudPlanLayout = ({
  title = 'AFFiNE Cloud',
  caption,
  select,
  toggle,
  scroll,
  lifetime,
  scrollRef,
}: PlanCardProps) => {
  return (
    <PricingCollapsible title={title} caption={caption}>
      <div className={styles.affineCloudHeader}>
        <div>{select}</div>
        <div>{toggle}</div>
      </div>
      <ScrollArea.Root>
        <ScrollArea.Viewport ref={scrollRef} className={styles.scrollArea}>
          {scroll}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          forceMount
          orientation="horizontal"
          className={styles.scrollBar}
        >
          <ScrollArea.Thumb className={styles.scrollThumb}></ScrollArea.Thumb>
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      {lifetime ? (
        <div style={{ paddingTop: 12 }} id="lifetimePricingPlan">
          {lifetime}
        </div>
      ) : null}
    </PricingCollapsible>
  );
};
