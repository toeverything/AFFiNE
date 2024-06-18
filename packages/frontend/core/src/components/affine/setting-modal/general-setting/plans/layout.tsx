import { Button, Divider, IconButton } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { openSettingModalAtom } from '@affine/core/atoms';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ArrowDownBigIcon,
  ArrowRightBigIcon,
  ArrowUpSmallIcon,
} from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { cssVar } from '@toeverything/theme';
import { useAtom, useAtomValue } from 'jotai';
import {
  type HtmlHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { settingModalScrollContainerAtom } from '../../atoms';
import * as styles from './layout.css';

export const SeeAllLink = () => {
  const t = useAFFiNEI18N();

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
const PricingCollapsible = ({
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
        <IconButton onClick={toggle}>
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
  aiTip?: boolean;
}

export const PlanLayout = ({ cloud, ai, aiTip }: PlanLayoutProps) => {
  const t = useAFFiNEI18N();
  const [{ scrollAnchor }, setOpenSettingModal] = useAtom(openSettingModalAtom);
  const aiPricingPlanRef = useRef<HTMLDivElement>(null);
  const aiScrollTipRef = useRef<HTMLDivElement>(null);
  const settingModalScrollContainer = useAtomValue(
    settingModalScrollContainerAtom
  );

  const updateAiTipState = useCallback(() => {
    if (!aiTip) return;
    const aiContainer = aiPricingPlanRef.current;
    if (!settingModalScrollContainer || !aiContainer) return;

    const minVisibleHeight = 30;

    const containerRect = settingModalScrollContainer.getBoundingClientRect();
    const aiTop = aiContainer.getBoundingClientRect().top - containerRect.top;
    const aiIntoView = aiTop < containerRect.height - minVisibleHeight;
    if (aiIntoView) {
      settingModalScrollContainer.dataset.aiVisible = '';
    }
  }, [aiTip, settingModalScrollContainer]);

  // TODO: Need a better solution to handle this situation
  useLayoutEffect(() => {
    if (!scrollAnchor) return;
    setTimeout(() => {
      if (scrollAnchor === 'aiPricingPlan' && aiPricingPlanRef.current) {
        aiPricingPlanRef.current.scrollIntoView();
        setOpenSettingModal(prev => ({ ...prev, scrollAnchor: undefined }));
      }
    });
  }, [scrollAnchor, setOpenSettingModal]);

  useEffect(() => {
    if (!settingModalScrollContainer || !aiScrollTipRef.current) return;

    settingModalScrollContainer.addEventListener('scroll', updateAiTipState);
    updateAiTipState();
    return () => {
      settingModalScrollContainer.removeEventListener(
        'scroll',
        updateAiTipState
      );
    };
  }, [settingModalScrollContainer, updateAiTipState]);

  const scrollAiIntoView = useCallback(() => {
    aiPricingPlanRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.plansLayoutRoot}>
      {/* TODO: SettingHeader component shouldn't have margin itself  */}
      <SettingHeader
        style={{ marginBottom: '0px' }}
        title={t['com.affine.payment.title']()}
      />
      {cloud}
      {ai ? (
        <>
          <Divider className={styles.aiDivider} />
          <div ref={aiPricingPlanRef} id="aiPricingPlan">
            {ai}
          </div>
        </>
      ) : null}

      {aiTip && settingModalScrollContainer
        ? createPortal(
            <div className={styles.aiScrollTip} ref={aiScrollTipRef}>
              <div className={styles.aiScrollTipLabel}>
                <ArrowDownBigIcon
                  width={24}
                  height={24}
                  color={cssVar('iconColor')}
                />
                <div className={styles.aiScrollTipText}>
                  {t['com.affine.ai-scroll-tip.title']()}
                </div>
                <div className={styles.aiScrollTipTag}>
                  <div className={styles.aiScrollTipTagInner}>
                    {t['com.affine.ai-scroll-tip.tag']()}
                  </div>
                </div>
              </div>
              <Button onClick={scrollAiIntoView} type="primary">
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
  scrollRef?: React.RefObject<HTMLDivElement>;
}
export const CloudPlanLayout = ({
  title = 'AFFiNE Cloud',
  caption,
  select,
  toggle,
  scroll,
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
    </PricingCollapsible>
  );
};

export interface AIPlanLayoutProps {
  title?: ReactNode;
  caption?: ReactNode;
}
export const AIPlanLayout = ({
  title = 'AFFiNE AI',
  caption,
  children,
}: PropsWithChildren<AIPlanLayoutProps>) => {
  return (
    <PricingCollapsible title={title} caption={caption}>
      {children}
    </PricingCollapsible>
  );
};
