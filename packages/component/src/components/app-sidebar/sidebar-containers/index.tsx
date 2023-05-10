import clsx from 'clsx';
import type { PropsWithChildren } from 'react';

import * as styles from './index.css';

export function SidebarTopContainer({ children }: PropsWithChildren) {
  return <div className={clsx([styles.topContainer])}>{children}</div>;
}

export function SidebarScrollableContainer({ children }: PropsWithChildren) {
  return <div className={clsx([styles.scrollableContainer])}>{children}</div>;
}
