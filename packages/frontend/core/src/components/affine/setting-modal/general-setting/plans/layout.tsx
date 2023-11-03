import { SettingHeader } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightBigIcon } from '@blocksuite/icons';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import type { HtmlHTMLAttributes, ReactNode } from 'react';

import * as styles from './layout.css';

export interface PlanLayoutProps
  extends Omit<HtmlHTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle: ReactNode;
  tabs: ReactNode;
  scroll: ReactNode;
  footer?: ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement>;
}

const SeeAllLink = () => {
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

export const PlanLayout = ({
  subtitle,
  tabs,
  scroll,
  title,
  footer = <SeeAllLink />,
  scrollRef,
}: PlanLayoutProps) => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.plansLayoutRoot}>
      {/* TODO: SettingHeader component shouldn't have margin itself  */}
      <SettingHeader
        style={{ marginBottom: '0px' }}
        title={title ?? t['com.affine.payment.title']()}
        subtitle={subtitle}
      />
      {tabs}
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
      {footer}
    </div>
  );
};
