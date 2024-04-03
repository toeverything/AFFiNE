import { IconButton } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightBigIcon, ArrowUpSmallIcon } from '@blocksuite/icons';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import {
  type HtmlHTMLAttributes,
  type ReactNode,
  useCallback,
  useState,
} from 'react';

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

export interface PlanLayoutProps
  extends Omit<HtmlHTMLAttributes<HTMLDivElement>, 'title'> {
  cloudTitle?: ReactNode;
  cloudCaption?: ReactNode;
  cloudSelect?: ReactNode;
  cloudToggle?: ReactNode;
  cloudScroll?: ReactNode;
  cloudScrollRef?: React.RefObject<HTMLDivElement>;

  aiTitle?: ReactNode;
  aiCaption?: ReactNode;
  aiPlanCard?: ReactNode;
}

export const PlanLayout = ({
  cloudTitle = 'AFFiNE Cloud',
  cloudCaption,
  cloudSelect,
  cloudToggle,
  cloudScroll,
  cloudScrollRef,

  // aiTitle = 'AFFiNE AI',
  // aiCaption,
  // aiPlanCard,
}: PlanLayoutProps) => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.plansLayoutRoot}>
      {/* TODO: SettingHeader component shouldn't have margin itself  */}
      <SettingHeader
        style={{ marginBottom: '0px' }}
        title={t['com.affine.payment.title']()}
      />

      <PricingCollapsible title={cloudTitle} caption={cloudCaption}>
        <div className={styles.affineCloudHeader}>
          <div>{cloudSelect}</div>
          <div>{cloudToggle}</div>
        </div>
        <ScrollArea.Root>
          <ScrollArea.Viewport
            ref={cloudScrollRef}
            className={styles.scrollArea}
          >
            {cloudScroll}
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

      {/* TODO: Hide AI temporarily */}
      {/* <Divider />

      <PricingCollapsible title={aiTitle} caption={aiCaption}>
        {aiPlanCard}
      </PricingCollapsible> */}
    </div>
  );
};
