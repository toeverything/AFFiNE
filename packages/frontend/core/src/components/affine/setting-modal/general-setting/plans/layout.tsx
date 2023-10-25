import { SettingHeader } from '@affine/component/setting-components';
import type { HtmlHTMLAttributes, ReactNode } from 'react';

import * as styles from './layout.css';

export interface PlanLayoutProps
  extends Omit<HtmlHTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle: ReactNode;
  tabs: ReactNode;
  scroll: ReactNode;
  footer?: ReactNode;
}

const SeeAllLink = () => (
  <a
    className={styles.allPlansLink}
    href="https://affine.pro/pricing"
    target="_blank"
    rel="noopener noreferrer"
  >
    See all plans →{/* TODO: icon */}
  </a>
);

export const PlanLayout = ({
  subtitle,
  tabs,
  scroll,
  title = 'Plans',
  footer = <SeeAllLink />,
}: PlanLayoutProps) => {
  return (
    <div className={styles.plansLayoutRoot}>
      {/* TODO: SettingHeader component shouldn't have margin itself  */}
      <SettingHeader
        style={{ marginBottom: '0px' }}
        title={title}
        subtitle={subtitle}
      />
      {tabs}
      <div className={styles.scrollArea}>{scroll}</div>
      {footer}
    </div>
  );
};
