import type { PropsWithChildren } from 'react';

import type { SidebarTab, SidebarTabProps } from '../entities/sidebar-tab';
import * as styles from './body.css';

export const MultiTabSidebarBody = (
  props: PropsWithChildren<SidebarTabProps & { tab?: SidebarTab | null }>
) => {
  const Component = props.tab?.Component;

  return (
    <div className={styles.root}>
      {props.children}
      {Component ? <Component {...props} /> : null}
    </div>
  );
};
