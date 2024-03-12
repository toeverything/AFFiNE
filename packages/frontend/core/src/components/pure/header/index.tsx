import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';

import { appSidebarFloatingAtom, appSidebarOpenAtom } from '../../app-sidebar';
import * as style from './style.css';

interface HeaderPros {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  bottomBorder?: boolean;
}

// The Header component is used to solve the following problems
// 1. Manage layout issues independently of page or business logic
// 2. Dynamic centered middle element (relative to the main-container), when the middle element is detected to collide with the two elements, the line wrapping process is performed
export const Header = ({ left, center, right }: HeaderPros) => {
  const open = useAtomValue(appSidebarOpenAtom);
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <div
      className={clsx(style.header)}
      data-open={open}
      data-sidebar-floating={appSidebarFloating}
      data-testid="header"
    >
      <div className={clsx(style.headerSideContainer)}>
        <div className={clsx(style.headerItem, 'left')}>
          <div>{left}</div>
        </div>
      </div>
      <div
        className={clsx({
          [style.headerCenter]: center,
        })}
      >
        {center}
      </div>
      <div className={clsx(style.headerSideContainer, 'right')}>
        <div className={clsx(style.headerItem, 'right')}>{right}</div>
      </div>
    </div>
  );
};

Header.displayName = 'Header';

export const HeaderDivider = () => {
  return <div className={style.headerDivider} />;
};
