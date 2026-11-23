import { Divider } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';
import { ArrowRightBigIcon } from '@blocksuite/icons/rc';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { type ReactNode, useRef } from 'react';

import { CollapsibleWrapper } from '../../layout';
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

export interface PlanLayoutProps {
  cloud?: ReactNode;
  ai?: ReactNode;
}

export const PlanLayout = ({ cloud, ai }: PlanLayoutProps) => {
  const t = useI18n();
  const plansRootRef = useRef<HTMLDivElement>(null);

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
    <CollapsibleWrapper title={title} caption={caption}>
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
    </CollapsibleWrapper>
  );
};
